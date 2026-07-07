import React, { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef, startTransition, lazy as lazyDefault, Suspense } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { ensureAdminSupabaseSession } from '@/lib/auth';
import { normalizeCustomerAddress } from '@/lib/customer-address';
import { CustomerLocationVariant } from '@/lib/customer-locations';
import { ensureSupabaseSessionForWrite, resolveSupabaseAccessTokenForApi } from '@/lib/ensureSupabaseSession';
import {
  extractMapsUrlFromText,
  isGoogleMapsShortLink,
  isGoogleMapsUrl,
  loadGoogleMapsGeocoderScript,
  resolveGoogleMapsInputToCoords,
  sanitizeGoogleMapsInput,
} from '@/lib/googleMapsLink';
import { useResumeSync } from '@/hooks/useResumeSync';
import { useClearAdminModalOnIOSBackground } from '@/hooks/useClearAdminModalOnIOSBackground';
import AdminHeader from '@/components/AdminHeader';
import { WebsiteBookingIntentBanner } from '@/components/admin/WebsiteBookingIntentBanner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
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
  UserPlus,
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
  FilterX,
  Tag,
  MessageSquare,
  DollarSign,
  BarChart3,
  ArrowLeft,
  ArrowRight,
  X,
  LogOut,
  RefreshCw,
  Navigation,
  ShoppingCart,
  ChevronDown,
  ChevronUp,
  Lock
} from 'lucide-react';
import { db, supabase, fetchCustomerIdsWithCompletedJobsMap, CUSTOMER_ROW_COLUMNS, CUSTOMER_ADMIN_LIST_PATCH_COLUMNS } from '@/lib/supabase';
import { scheduleDocumentGeneratorPreload } from '@/lib/document-generator-preload';
import { useAdminRole } from '@/lib/useAdminRole';
import { saveAdminCompletedJobEdit } from '@/lib/adminSaveCompletedJobEdit';
import { transformCustomerData, transformTechnicianData } from '@/lib/adminDashboardTransforms';
import { Customer, Job, Technician } from '@/types';
import { cloudinaryService, compressImage, validateImageFile } from '@/lib/cloudinary';
import { toast } from 'sonner';
import { TOAST_VALIDATION } from '@/lib/toastOptions';
import { isIOS, isPWA, shouldUseFileInputFallback, requestCameraAccess, createVideoElement, checkCameraPermission } from '@/lib/cameraUtils';
import { getCachedQrCodes, cacheQrCodes, shouldUseCache, CommonQrCode } from '@/lib/qrCodeManager';
import { openInGoogleMaps, extractCoordinates, formatAddressForDisplay, openGoogleMapsDirectionsBetween } from '@/lib/maps';
import {
  geolocationFailureMessage,
  getDeviceLocation,
  isGeolocationPositionError,
} from '@/lib/geolocation';
import {
  cn,
  formatPhoneForWhatsApp,
  normalizePhoneForSearch,
  shouldRunAdminJobNumberSearch,
} from '@/lib/utils';
import {
  EQUIPMENT_BRAND_DATA as brandData,
  EQUIPMENT_MODEL_DATA as modelData,
} from '@/lib/equipment-suggestions';
import FollowUpModal from '@/components/FollowUpModal';
import { sendNotification, createJobAssignedNotification, createJobCompletedNotification, createJobCancelledNotification, createJobAssignmentRequestNotification } from '@/lib/notifications';
import { hapticSwitch, hapticTap } from '@/lib/haptics';
// Heavy, on-demand modals and full-screen views are code-split so they stay
// out of the main admin dashboard chunk and only load when actually opened.
const BillModal = lazyDefault(() => import('./BillModal'));
const AMCModal = lazyDefault(() => import('./AMCModal'));
const QuotationModal = lazyDefault(() => import('./QuotationModal'));
const TaxInvoiceModal = lazyDefault(() => import('./TaxInvoiceModal'));
const GSTInvoicesPage = lazyDefault(() => import('./GSTInvoicesPage'));
const AMCViewPage = lazyDefault(() => import('./AMCViewPage'));
// Letterhead builder is heavy (rich text + sanitizer + preview iframe) and only
// used on demand. Code-split it so the main admin bundle stays lean.
const LetterheadDocumentsPage = lazyDefault(() => import('./LetterheadDocumentsPage'));
import { toDateOnly } from '@/lib/amcAutoJobSchedule';
import ImageUpload from '@/components/ImageUpload';
const TechnicianPayments = lazyDefault(() => import('./TechnicianPayments'));
const BillingStats = lazyDefault(() => import('./BillingStats'));
const Analytics = lazyDefault(() => import('./Analytics'));
const InventoryManagement = lazyDefault(() => import('./InventoryManagement'));
import { generateJobNumber, formatPreferredTimeSlot, mapServiceTypesToDbValue, extractLocationFromAddressString, bangaloreAreas, levenshteinDistance, calculateSimilarity, extractPhotoUrls, normalizePhotoUrl, parseJobRequirements, getFormattedTimeSlot, findLeadSource, getLeadSourceFromJob, getJobCustomTimeLabel, normalizeLeadType, normalizeServiceSubType, completedJobMatchesDashboardClientFilters, isOfficeCompletedJob, jobCompletionLocalDateIso, ZERO_COMMISSION_EMPLOYEE_ID, jobsMatchOngoingTab } from '@/lib/adminUtils';
import { getLocationLinkFromObject, getLocationUnavailableMessage, resolveJobDestinationCoordsSync, resolveJobLatLngFromRow } from '@/lib/jobLocationHelpers';
import { applyAutoMoveToOngoingOnDateFlag } from '@/lib/followUpToOngoing';
import { enrichJobsWithAfterPhotosIfNeeded } from '@/lib/jobReportPhotos';
import {
  consumeAdminDashboardPrefetch,
  readAdminDashboardCache,
  writeAdminDashboardCache,
  clearAdminDashboardCache,
  invalidateAdminDashboardCaches,
  getModuleOngoingJobsSnapshot,
  setModuleOngoingJobsSnapshot,
  getModuleJobsListCache,
  setModuleJobsListCache,
  clearModuleJobsListCache,
  getModuleAdminUiState,
  setModuleAdminUiState,
  buildJobsListCacheKey,
  getModuleDashboardSessionReady,
  setModuleDashboardSessionReady,
  getModuleJobsForUiRestore,
  type AdminDashboardSnapshot,
  type AdminStatusFilter,
} from '@/lib/adminDashboardCache';
import {
  adminDashboardLocation,
  buildAdminDashboardSearch,
  jobTabSlugToStatusFilter,
  parseAdminDashboardUrl,
  type AdminModalSlug,
  isAdminModalSlug,
  readAdminTabViewFromSearch,
  isAdminTabViewParam,
  isAdminOverlayViewParam,
  readAdminOverlayFromSearch,
  isAdminToolParam,
  MANAGER_BLOCKED_ADMIN_TOOLS,
  type AdminDashboardView,
  type AdminToolDialog,
  type LetterheadDocumentType,
} from '@/lib/adminDashboardUrl';
import WarrantyManagementDialog from './admin/WarrantyManagementDialog';
import { CompleteJobDialog } from './admin/CompleteJobDialog';
import { StatsCards } from './admin/StatsCards';
import EditCustomerDialog from './admin/EditCustomerDialog';
import AddCustomerDialog from './admin/AddCustomerDialog';
import CustomerReportDialog from './admin/CustomerReportDialog';
import SendMessageDialog from './admin/SendMessageDialog';
import AdminEmailComposerDialog from './admin/AdminEmailComposer';
import AdminWhatsAppComposerDialog from './admin/AdminWhatsAppComposer';
import type { AdminEmailTemplateType } from '@/lib/admin-email-templates';
import { getValidCustomerEmail } from '@/lib/customer-email';
import { sendJobCompletionEmail } from '@/lib/send-job-completion-email';
import type { DocumentBrand } from '@/lib/service-brands';
import ShareTechnicianInfoToCustomerDialog from './admin/ShareTechnicianInfoToCustomerDialog';
import RecentAccountsDialog from './admin/RecentAccountsDialog';
import DirectSaleDialog from './admin/DirectSaleDialog';
import AmountTrackersDialog from './admin/AmountTrackersDialog';
import { EmailSentLogDialog } from './admin/EmailSentLogDialog';
import MeasureDistanceToolDialog from './admin/MeasureDistanceToolDialog';
import { settingsPath } from '@/lib/settingsSections';
import ServiceHistoryDialog from './admin/ServiceHistoryDialog';
import PhotoGalleryDialog from './admin/PhotoGalleryDialog';
import PhotoViewerDialog from './admin/PhotoViewerDialog';
import CustomerPhotoGalleryDialog from './admin/CustomerPhotoGalleryDialog';
import AssignJobDialog from './admin/AssignJobDialog';
import AddTeamDialog from './admin/AddTeamDialog';
import RemoveTeamDialog from './admin/RemoveTeamDialog';
import NewJobDialog from './admin/NewJobDialog';
import { AddReminderDialog } from './reminders/AddReminderDialog';
import { TodayRemindersPopup } from './reminders/TodayRemindersPopup';
import { CustomerRemindersDialog } from './reminders/CustomerRemindersDialog';
import EditJobDialog from './admin/EditJobDialog';
import PhoneNumbersDialog from './admin/PhoneNumbersDialog';
import DescriptionDialog from './admin/DescriptionDialog';
import JobAddressDialog from './admin/JobAddressDialog';
import AddressDialog from './admin/AddressDialog';
import DenyJobDialog from './admin/DenyJobDialog';
import ReassignJobDialog from './admin/ReassignJobDialog';
import EditCompletedJobDialog from './admin/EditCompletedJobDialog';
import EditAMCDialog from './admin/EditAMCDialog';
import WhatsAppDialog from './admin/WhatsAppDialog';
import { AdminScreenLoader, AdminInlineLoader } from './admin/AdminLoaders';
import { AdminDeleteConfirmDialogs } from './admin/AdminDeleteConfirmDialogs';
import { AdminOverrideExistingCustomerDialog } from './admin/AdminOverrideExistingCustomerDialog';
import AmcInfoDialog from './admin/AmcInfoDialog';
import MoveToOngoingDialog from './admin/MoveToOngoingDialog';
import CompleteTechnicianSelectDialog from './admin/CompleteTechnicianSelectDialog';
import { AdminDashboardHeader } from './admin/AdminDashboardHeader';
import { AdminSearchResultsBar } from './admin/AdminSearchResultsBar';
import { DeniedJobsDateFilter } from './admin/DeniedJobsDateFilter';
import { CompletedJobsFiltersSection } from './admin/CompletedJobsFiltersSection';
import JobDistanceMeasurementDialog, {
  type JobCustomDistanceResult,
  type JobTechnicianDistanceRow,
} from './admin/JobDistanceMeasurementDialog';
import { OngoingJobsFiltersDialog } from './admin/OngoingJobsFiltersDialog';
import { AdminTabViewShell } from './admin/AdminTabViewShell';
import { AdminCustomerJobsList } from './admin/AdminCustomerJobsList';
import {
  AdminDashboardListProvider,
  type AdminDashboardListActions,
} from '@/contexts/AdminDashboardListContext';
import {
  broadcastTechnicianJobListRefresh,
  broadcastTechnicianJobListRefreshForJob,
} from '@/lib/technicianJobListSync';

declare global {
  interface Window {
    google: any;
    initMap: () => void;
  }
}

// Utility functions moved to @/lib/adminUtils

const AdminDashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAdmin, authInitializing, logout } = useAuth();
  const { isManager } = useAdminRole();
  const managerRestrictedTitle = 'Restricted for Manager role';
  const savedUi = getModuleAdminUiState();
  const initialDashboardCache = readAdminDashboardCache();
  const initialOngoingJobs = initialDashboardCache
    ? ((initialDashboardCache.jobs as Job[]) ?? [])
    : ((getModuleOngoingJobsSnapshot() as Job[]) ?? []);
  const restoredJobs = getModuleJobsForUiRestore(savedUi) as Job[];
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [jobs, setJobs] = useState<Job[]>(() =>
    restoredJobs.length > 0 ? restoredJobs : initialOngoingJobs
  );
  const [allFollowUpJobs, setAllFollowUpJobs] = useState<Job[]>([]); // All follow-up jobs for glow effect
  const [technicians, setTechnicians] = useState<Technician[]>(() => {
    if (!initialDashboardCache?.technicianRows) return [];
    return (initialDashboardCache.technicianRows as any[]).map((tech) => ({
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
      updatedAt: tech.updated_at,
    }));
  });
  // Latest technicians for async callbacks (avoids loadFilteredJobs ↔ technicians churn → assign/reassign dialog blink).
  const techniciansRef = useRef<Technician[]>([]);
  techniciansRef.current = technicians;
  // Slim technician list for historical displays (Completed By, reports, etc.). Includes INACTIVE.
  const [techniciansForReports, setTechniciansForReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(
    () =>
      !getModuleDashboardSessionReady() &&
      !initialDashboardCache &&
      restoredJobs.length === 0 &&
      initialOngoingJobs.length === 0
  );
  /** After idle resume / cross-device drift, skip instant tab cache until the next fetch lands. */
  const [tabCachesStale, setTabCachesStale] = useState(false);
  const [isResumeListSyncing, setIsResumeListSyncing] = useState(false);
  const [customerAMCStatus, setCustomerAMCStatus] = useState<Record<string, boolean>>({}); // Map customer ID to hasActiveAMC
  const [customerPriorServiceStatus, setCustomerPriorServiceStatus] = useState<Record<string, boolean>>({}); // ≥1 completed job
  const [searchTerm, setSearchTerm] = useState('');
  const [searchQuery, setSearchQuery] = useState(''); // For the input field
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Customer[] | null>(null); // API search results (find any customer in DB)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  /** Local state only — URL sync caused iOS PWA to reopen this menu after app restart. */
  const [moreOptionsCustomerId, setMoreOptionsCustomerId] = useState<string | null>(null);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [phonePopupOpen, setPhonePopupOpen] = useState(false);
  const [selectedCustomerPhone, setSelectedCustomerPhone] = useState<Customer | null>(null);
  const [whatsappPopupOpen, setWhatsappPopupOpen] = useState(false);
  const [selectedCustomerWhatsApp, setSelectedCustomerWhatsApp] = useState<Customer | null>(null);
  const [billModalOpen, setBillModalOpen] = useState(false);
  const [selectedCustomerForBill, setSelectedCustomerForBill] = useState<Customer | null>(null);
  const [quotationModalOpen, setQuotationModalOpen] = useState(false);
  const [selectedCustomerForQuotation, setSelectedCustomerForQuotation] = useState<Customer | null>(null);
  const [amcModalOpen, setAmcModalOpen] = useState(false);
  const [selectedCustomerForAMC, setSelectedCustomerForAMC] = useState<Customer | null>(null);
  const [amcInfoDialogOpen, setAmcInfoDialogOpen] = useState(false);
  const [amcInfo, setAmcInfo] = useState<any>(null);
  const [loadingAMCInfo, setLoadingAMCInfo] = useState(false);
  const [amcEditDialogOpen, setAmcEditDialogOpen] = useState(false);
  const [taxInvoiceModalOpen, setTaxInvoiceModalOpen] = useState(false);
  const [selectedCustomerForTaxInvoice, setSelectedCustomerForTaxInvoice] = useState<Customer | null>(null);
  const initialOverlay = readAdminOverlayFromSearch(location.search);
  const [showGSTInvoicesPage, setShowGSTInvoicesPage] = useState(initialOverlay.gst);
  const [gstInSubScreen, setGstInSubScreen] = useState(false);
  const [showAMCViewPage, setShowAMCViewPage] = useState(initialOverlay.amc);
  const [showLetterheadDocsPage, setShowLetterheadDocsPage] = useState(initialOverlay.letterhead);
  const [letterheadInitialType, setLetterheadInitialType] = useState<LetterheadDocumentType | undefined>(
    initialOverlay.letterheadType
  );
  const [currentView, setCurrentView] = useState<AdminDashboardView>(() =>
    readAdminTabViewFromSearch(location.search)
  );
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
  const [addressLocationVariant, setAddressLocationVariant] = useState<
    Record<string, CustomerLocationVariant>
  >({});
  
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
  
  // Preserve scroll position when WhatsApp dialog opens after assign/reassign (so page doesn't jump to top)
  const scrollPositionBeforeWhatsAppRef = useRef(0);
  const adminListScrollYRef = useRef<number | null>(null);
  const prevAdminModalRef = useRef<AdminModalSlug | null>(null);
  const completeDialogOpenRef = useRef(false);

  const scheduleAdminScrollRestore = useCallback((y: number) => {
    const restore = () => window.scrollTo({ top: y, behavior: 'auto' });
    requestAnimationFrame(() => {
      restore();
      requestAnimationFrame(restore);
    });
    window.setTimeout(restore, 50);
    window.setTimeout(restore, 200);
  }, []);
  const handleViewChange = (view: AdminDashboardView) => {
    if (isManager && view !== 'dashboard') {
      // Manager role cannot enter payments / billing / analytics / inventory.
      return;
    }
    hapticSwitch();
    if (view === 'dashboard') {
      if (
        isAdminTabViewParam(new URLSearchParams(location.search).get('view')) ||
        isAdminOverlayViewParam(new URLSearchParams(location.search).get('view'))
      ) {
        navigate(
          adminDashboardLocation(
            buildAdminDashboardSearch({ view: null, clearView: true }, location.search)
          ),
          { replace: true }
        );
      } else {
        setCurrentView('dashboard');
      }
    } else {
      navigate(
        adminDashboardLocation(
          buildAdminDashboardSearch({ view, clearModal: true, clearSearch: true }, location.search)
        )
      );
    }
  };

  const closeAdminModal = useCallback(() => {
    navigate(
      adminDashboardLocation(buildAdminDashboardSearch({ clearModal: true }, location.search)),
      { replace: true }
    );
  }, [navigate, location.search]);

  const openAdminModal = useCallback(
    (
      modal: AdminModalSlug,
      params: {
        jobId?: string;
        customerId?: string;
        photoType?: 'before' | 'after';
        photoIdx?: number;
      } = {}
    ) => {
      hapticTap();
      adminListScrollYRef.current =
        window.scrollY ?? document.documentElement.scrollTop ?? 0;
      startTransition(() => {
        navigate(
          adminDashboardLocation(
            buildAdminDashboardSearch(
              {
                modal,
                jobId: params.jobId ?? null,
                customerId: params.customerId ?? null,
                photoType: params.photoType ?? null,
                photoIdx: params.photoIdx ?? null,
              },
              location.search
            )
          )
        );
      });
    },
    [navigate, location.search]
  );

  const openAdminWhatsappModal = useCallback(() => {
    navigate(
      adminDashboardLocation(
        buildAdminDashboardSearch({ clearModal: true, modal: 'whatsapp' }, location.search)
      ),
      { replace: true }
    );
  }, [navigate, location.search]);

  /** Tab switches stay in React state (no ?tab= history). Modals still use ?modal= for swipe-back. */
  const switchJobTab = useCallback(
    (filter: AdminStatusFilter) => {
      hapticSwitch();
      setStatusFilter(filter);
      setCurrentPage(1);

      const parsed = parseAdminDashboardUrl(location.search);
      if (parsed.modal || parsed.tab || parsed.view || parsed.tool) {
        navigate(
          adminDashboardLocation(
            buildAdminDashboardSearch(
              {
                clearModal: true,
                clearView: true,
                clearTool: true,
                clearSearch: true,
                tab: null,
              },
              location.search
            )
          ),
          { replace: true }
        );
      }
    },
    [navigate, location.search]
  );

  const onAdminModalOpenChange = useCallback(
    (modal: AdminModalSlug, open: boolean) => {
      if (!open && parseAdminDashboardUrl(location.search).modal === modal) {
        closeAdminModal();
      }
    },
    [closeAdminModal, location.search]
  );

  /** Outside tap / Escape: clear local open state immediately, then strip ?modal= */
  const bindAdminModalDismiss = useCallback(
    (modal: AdminModalSlug, reset?: () => void) =>
      (open: boolean) => {
        if (!open) {
          reset?.();
          onAdminModalOpenChange(modal, false);
        }
      },
    [onAdminModalOpenChange]
  );

  useClearAdminModalOnIOSBackground(() => setMoreOptionsCustomerId(null));

  // Legacy ?modal=more-options — strip from URL without reopening (iOS PWA restore).
  useEffect(() => {
    if (!location.pathname.startsWith('/admin')) return;
    const parsed = parseAdminDashboardUrl(location.search);
    if (parsed.modal !== 'more-options') return;
    navigate(
      adminDashboardLocation(
        buildAdminDashboardSearch({ clearModal: true }, location.search)
      ),
      { replace: true }
    );
  }, [location.pathname, location.search, navigate]);

  const adminModalUrl = useMemo(
    () => parseAdminDashboardUrl(location.search),
    [location.search]
  );

  // Keep full-page admin views in sync with ?view= for mobile back / swipe-back.
  useEffect(() => {
    if (!location.pathname.startsWith('/admin')) return;

    const parsed = parseAdminDashboardUrl(location.search);
    const viewParam = parsed.view;
    const overlay = readAdminOverlayFromSearch(location.search);

    setShowGSTInvoicesPage(overlay.gst);
    setShowAMCViewPage(overlay.amc);
    setShowLetterheadDocsPage(overlay.letterhead);
    setLetterheadInitialType(overlay.letterheadType);

    if (isAdminOverlayViewParam(viewParam)) {
      return;
    }

    if (!isAdminTabViewParam(viewParam)) {
      setCurrentView('dashboard');
      return;
    }
    if (isManager) {
      setCurrentView('dashboard');
      if (isAdminTabViewParam(viewParam)) {
        navigate('/admin', { replace: true });
      }
      return;
    }
    setCurrentView(viewParam);
  }, [location.pathname, location.search, isManager, navigate]);

  // Tab buttons use React state only; apply legacy ?tab= once then strip from URL.
  useEffect(() => {
    if (!location.pathname.startsWith('/admin')) return;
    const parsed = parseAdminDashboardUrl(location.search);
    if (!parsed.tab) return;
    const sf = jobTabSlugToStatusFilter(parsed.tab);
    setStatusFilter(sf);
    setCurrentPage(1);
    navigate(
      adminDashboardLocation(
        buildAdminDashboardSearch({ tab: null }, location.search)
      ),
      { replace: true }
    );
  }, [location.pathname, location.search, navigate]);

  // Tools menu dialogs (?tool=) — open state derived from URL so swipe-back closes instantly.
  const activeAdminTool = useMemo((): AdminToolDialog | null => {
    if (!location.pathname.startsWith('/admin')) return null;
    const toolParam = new URLSearchParams(location.search).get('tool');
    if (!isAdminToolParam(toolParam)) return null;
    if (isManager && MANAGER_BLOCKED_ADMIN_TOOLS.has(toolParam)) return null;
    return toolParam;
  }, [location.pathname, location.search, isManager]);

  useEffect(() => {
    if (!location.pathname.startsWith('/admin')) return;
    const toolParam = new URLSearchParams(location.search).get('tool');
    if (isManager && isAdminToolParam(toolParam) && MANAGER_BLOCKED_ADMIN_TOOLS.has(toolParam)) {
      navigate(
        adminDashboardLocation(
          buildAdminDashboardSearch({ clearTool: true }, location.search)
        ),
        { replace: true }
      );
    }
  }, [location.pathname, location.search, isManager, navigate]);

  const openAdminTool = (tool: AdminToolDialog) => {
    if (isManager && MANAGER_BLOCKED_ADMIN_TOOLS.has(tool)) return;
    setToolsMenuOpen(false);
    hapticTap();
    navigate(
      adminDashboardLocation(
        buildAdminDashboardSearch({ tool, clearModal: true, clearView: true }, location.search)
      )
    );
  };

  const closeAdminTool = () => {
    setToolsMenuOpen(false);
    if (new URLSearchParams(location.search).get('tool')) {
      navigate(
        adminDashboardLocation(
          buildAdminDashboardSearch({ clearTool: true }, location.search)
        ),
        { replace: true }
      );
    }
  };

  const handleAdminToolOpenChange = (tool: AdminToolDialog, open: boolean) => {
    if (open) {
      openAdminTool(tool);
      return;
    }
    if (new URLSearchParams(location.search).get('tool') === tool) {
      closeAdminTool();
    }
  };

  useEffect(() => {
    if (isManager && currentView !== 'dashboard') {
      setCurrentView('dashboard');
    }
  }, [isManager, currentView]);

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
    service_sub_type: 'Service',
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
    lead_source: '',
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
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);
  const SERVICE_HISTORY_PAGE_SIZE = 50;
  const [selectedPhoto, setSelectedPhoto] = useState<{url: string, index: number, total: number} | null>(null);
  const [selectedBillPhotos, setSelectedBillPhotos] = useState<string[] | null>(null); // Track bill photos array for navigation
  // Optional context for naming downloaded photos (e.g. customer name + bill/payment).
  const [photoDownloadMeta, setPhotoDownloadMeta] = useState<{ customerName?: string; type?: string } | null>(null);
  const [selectedCustomerPhotos, setSelectedCustomerPhotos] = useState<string[] | null>(null); // Track customer photos array for navigation
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
  // Job IDs just completed by admin in this session - don't play sound for these (only for technician completions)
  const jobIdsCompletedByAdminRef = React.useRef<Set<string>>(new Set());
  
  // Distance measurement dialog state
  const [distanceMeasurementDialogOpen, setDistanceMeasurementDialogOpen] = useState(false);
  const [selectedJobForDistance, setSelectedJobForDistance] = useState<Job | null>(null);
  const [technicianDistances, setTechnicianDistances] = useState<JobTechnicianDistanceRow[]>([]);
  const [isCalculatingDistances, setIsCalculatingDistances] = useState(false);
  /** Manual pair: technician (`__tech__`) or job id — driving distance only when user clicks Calculate */
  const [customDistanceFromId, setCustomDistanceFromId] = useState<string>('');
  const [customDistanceToId, setCustomDistanceToId] = useState<string>('');
  const [customDistanceResult, setCustomDistanceResult] = useState<JobCustomDistanceResult | null>(null);
  const [isLoadingCustomDistance, setIsLoadingCustomDistance] = useState(false);
  const [isOpeningCustomDistanceMaps, setIsOpeningCustomDistanceMaps] = useState(false);
  
  // Authentication state hooks - MUST be declared before any conditional returns

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
  const [recentAccountsToday, setRecentAccountsToday] = useState<Customer[]>([]);
  const [loadingRecentAccounts, setLoadingRecentAccounts] = useState(false);
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false);
  const recentAccountsDialogOpen = activeAdminTool === 'recent-accounts';
  const emailSentLogOpen = activeAdminTool === 'sent-email-log';
  const directSaleOpen = activeAdminTool === 'direct-sale';
  const amountTrackersOpen = activeAdminTool === 'amount-trackers';
  const measureDistanceOpen = activeAdminTool === 'measure-distance';

  // Close Tools dropdown before paint when URL changes (gesture back / in-app navigate).
  useLayoutEffect(() => {
    setToolsMenuOpen(false);
  }, [location.pathname, location.search]);

  const [step5JobData, setStep5JobData] = useState({
    service_type: 'RO' as 'RO' | 'SOFTENER',
    service_sub_type: 'Service',
    service_sub_type_custom: '',
    scheduled_date: '',
    scheduled_time_slot: 'MORNING' as 'MORNING' | 'AFTERNOON' | 'EVENING' | 'CUSTOM',
    scheduled_time_custom: '',
    description: '',
    lead_source: '',
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
  const [assignAfterMoveToOngoing, setAssignAfterMoveToOngoing] = useState(false);
  const [followUpAssignFlow, setFollowUpAssignFlow] = useState(false);
  const [followUpAssignTechnicianId, setFollowUpAssignTechnicianId] = useState<string>('');
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
  const [technicianSelectDialogOpen, setTechnicianSelectDialogOpen] = useState(false);
  const [selectedTechnicianForComplete, setSelectedTechnicianForComplete] = useState<string>('');
  const completeFlowSnapshotRef = useRef<{
    jobId: string;
    assignedTechnicianId: string | null;
    status: string;
    assignedDate: string | null;
  } | null>(null);
  const suppressCompleteFlowRevertRef = useRef(false);
  // Complete job state moved to CompleteJobDialog component
  const [commonQrCodes, setCommonQrCodes] = useState<CommonQrCode[]>([]);
  const [customerReportDialogOpen, setCustomerReportDialogOpen] = useState(false);
  const [selectedCustomerForReport, setSelectedCustomerForReport] = useState<Customer | null>(null);
  const [highlightCompletedJobId, setHighlightCompletedJobId] = useState<string | null>(null);
  const [loadedCompletedJobDetails, setLoadedCompletedJobDetails] = useState<Record<string, any>>({});
  const [loadingCompletedJobDetails, setLoadingCompletedJobDetails] = useState<Record<string, boolean>>({});
  const [editCompletedJobDialogOpen, setEditCompletedJobDialogOpen] = useState(false);
  const [selectedCompletedJob, setSelectedCompletedJob] = useState<any | null>(null);
  const [completedJobEditData, setCompletedJobEditData] = useState<any>({});
  const [sendMessageDialogOpen, setSendMessageDialogOpen] = useState(false);
  const [selectedJobForMessage, setSelectedJobForMessage] = useState<any | null>(null);
  const [emailComposerOpen, setEmailComposerOpen] = useState(false);
  const [emailComposerCustomerId, setEmailComposerCustomerId] = useState<string | null>(null);
  const [emailComposerJobId, setEmailComposerJobId] = useState<string | null>(null);
  const [emailComposerContext, setEmailComposerContext] = useState<'default' | 'completed_job'>('default');
  const [emailComposerForcedBrand, setEmailComposerForcedBrand] = useState<DocumentBrand | null>(null);
  const [emailComposerTemplate, setEmailComposerTemplate] = useState<AdminEmailTemplateType>('general');
  const [whatsappComposerOpen, setWhatsappComposerOpen] = useState(false);
  const [whatsappComposerCustomerId, setWhatsappComposerCustomerId] = useState<string | null>(null);
  const [whatsappComposerTemplate, setWhatsappComposerTemplate] = useState<AdminEmailTemplateType>('general');
  const [shareTechnicianInfoDialogOpen, setShareTechnicianInfoDialogOpen] = useState(false);
  const [selectedJobForShareInfo, setSelectedJobForShareInfo] = useState<Job | null>(null);
  const [addReminderDialogOpen, setAddReminderDialogOpen] = useState(false);
  const [reminderEntity, setReminderEntity] = useState<{ type: 'customer' | 'job' | 'general'; id: string | null }>({ type: 'general', id: null });
  const [reminderContextLabel, setReminderContextLabel] = useState<string>('');
  const [viewRemindersCustomer, setViewRemindersCustomer] = useState<Customer | null>(null);
  const [warrantyDialogOpen, setWarrantyDialogOpen] = useState(false);
  const [warrantyDialogCustomer, setWarrantyDialogCustomer] = useState<{
    id: string;
    customer_id: string;
    full_name: string;
    phone: string;
    model: string;
    brand: string;
    visible_address: string;
  } | null>(null);
  const [messageSentFilter, setMessageSentFilter] = useState<'all' | 'sent' | 'not_sent'>('not_sent');
  const [statusFilter, setStatusFilter] = useState<AdminStatusFilter>(() => {
    const tab = parseAdminDashboardUrl(location.search).tab;
    if (tab) return jobTabSlugToStatusFilter(tab);
    return savedUi.statusFilter;
  });
  // Ongoing-only sub-filters (UI parity with completed filters, but only for ongoing section)
  const [ongoingAssignmentFilter, setOngoingAssignmentFilter] = useState<'all' | 'assigned' | 'unassigned'>('all');
  const [ongoingAssignedTechnicianFilter, setOngoingAssignedTechnicianFilter] = useState<string>('all');
  const [ongoingServiceSubTypeFilter, setOngoingServiceSubTypeFilter] = useState<string>('all');
  const [ongoingFilterDialogOpen, setOngoingFilterDialogOpen] = useState(false);
  const [draftOngoingAssignmentFilter, setDraftOngoingAssignmentFilter] = useState<'all' | 'assigned' | 'unassigned'>('all');
  const [draftOngoingAssignedTechnicianFilter, setDraftOngoingAssignedTechnicianFilter] = useState<string>('all');
  const [draftOngoingServiceSubTypeFilter, setDraftOngoingServiceSubTypeFilter] = useState<string>('all');
  const [loadingCustomerJobs, setLoadingCustomerJobs] = useState<{[customerId: string]: boolean}>({});
  const [showAllFollowups, setShowAllFollowups] = useState<boolean>(false);
  // Pagination state
  const [currentPage, setCurrentPage] = useState<number>(() => savedUi.currentPage);
  const [pageSize] = useState<number>(20);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [totalCount, setTotalCount] = useState<number>(0);
  // Helper function to get today's date in local timezone (YYYY-MM-DD format)
  const getTodayLocalDate = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  const getTomorrowLocalDate = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
  };

  // Date filter for denied jobs (default to today)
  const [deniedDateFilter, setDeniedDateFilter] = useState<string>(() => {
    return getTodayLocalDate();
  });
  // Date filter for completed jobs (default to today)
  const [completedDateFilter, setCompletedDateFilter] = useState<string>(
    () => savedUi.completedDateFilter
  );
  const [completedDatePreset, setCompletedDatePreset] = useState<
    'day' | 'week' | 'month' | 'custom'
  >(() => savedUi.completedDatePreset);
  const [completedRangeStartDate, setCompletedRangeStartDate] = useState<string>(
    () => savedUi.completedRangeStartDate
  );
  const [completedRangeEndDate, setCompletedRangeEndDate] = useState<string>(
    () => savedUi.completedRangeEndDate
  );

  useEffect(() => {
    setModuleAdminUiState({
      statusFilter,
      currentPage,
      completedDatePreset,
      completedDateFilter,
      completedRangeStartDate,
      completedRangeEndDate,
    });
  }, [
    statusFilter,
    currentPage,
    completedDatePreset,
    completedDateFilter,
    completedRangeStartDate,
    completedRangeEndDate,
  ]);
  const [completedLeadTypeFilter, setCompletedLeadTypeFilter] = useState<string>('all');
  const [completedServiceSubTypeFilter, setCompletedServiceSubTypeFilter] = useState<string>('all');
  const [completedByFilter, setCompletedByFilter] = useState<string>('all');
  const [completedFilterDialogOpen, setCompletedFilterDialogOpen] = useState(false);
  const [completedFilterSourceJobs, setCompletedFilterSourceJobs] = useState<any[]>([]);
  const [draftCompletedDatePreset, setDraftCompletedDatePreset] = useState<'day' | 'week' | 'month' | 'custom'>('day');
  const [draftCompletedDateFilter, setDraftCompletedDateFilter] = useState<string>(() => getTodayLocalDate());
  const [draftCompletedRangeStartDate, setDraftCompletedRangeStartDate] = useState<string>(() => getTodayLocalDate());
  const [draftCompletedRangeEndDate, setDraftCompletedRangeEndDate] = useState<string>(() => getTodayLocalDate());
  const [draftCompletedLeadTypeFilter, setDraftCompletedLeadTypeFilter] = useState<string>('all');
  const [draftCompletedServiceSubTypeFilter, setDraftCompletedServiceSubTypeFilter] = useState<string>('all');
  const [draftCompletedByFilter, setDraftCompletedByFilter] = useState<string>('all');
  // Job counts for stats cards (loaded separately)
  const [jobCounts, setJobCounts] = useState<{ongoing: number; followup: number; denied: number; completed: number}>(() =>
    initialDashboardCache?.jobCounts ?? {
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
  const [whatsappDialogOpen, setWhatsappDialogOpen] = useState(false);
  const [whatsappTechnician, setWhatsappTechnician] = useState<{name: string, phone: string} | null>(null);
  const [whatsappServiceSubType, setWhatsappServiceSubType] = useState<string>('');
  const [whatsappCustomerName, setWhatsappCustomerName] = useState<string>('');
  const [whatsappLocation, setWhatsappLocation] = useState<string>('');
  const [whatsappLeadSource, setWhatsappLeadSource] = useState<string>('');
  const [whatsappCustomTime, setWhatsappCustomTime] = useState<string>('');
  const [jobToEdit, setJobToEdit] = useState<Job | null>(null);
  const [editJobDialogOpen, setEditJobDialogOpen] = useState(false);
  const [photoToDelete, setPhotoToDelete] = useState<{jobId: string, photoIndex: number, photoUrl: string} | null>(null);
  const [deletePhotoDialogOpen, setDeletePhotoDialogOpen] = useState(false);
  const [isDeletingPhoto, setIsDeletingPhoto] = useState(false);
  const [customerPhotoToDelete, setCustomerPhotoToDelete] = useState<{photoUrl: string, photoIndex: number} | null>(null);
  const [deleteCustomerPhotoDialogOpen, setDeleteCustomerPhotoDialogOpen] = useState(false);
  const [isDeletingCustomerPhoto, setIsDeletingCustomerPhoto] = useState(false);
  const [photoViewerOpen, setPhotoViewerOpen] = useState(false);
  const loadJobsRequestRef = useRef(0);
  /** Session cache for Completed / Follow-up tab switches; always refreshed in background on open. */
  const jobsListCacheRef = useRef(new Map<string, Job[]>());
  /** Snapshot so switching back to Ongoing feels instant without Completed-style cache. */
  const ongoingJobsSnapshotRef = useRef<Job[]>(
    initialOngoingJobs.length > 0 ? initialOngoingJobs : (getModuleOngoingJobsSnapshot() as Job[])
  );
  const prevStatusFilterRef = useRef<AdminStatusFilter | null>(null);
  /** Newly created customers (row + optional job) until they appear in embedded job payloads — avoids derive-from-jobs wiping them. */
  const pendingNewCustomersRef = useRef<Map<string, Customer>>(new Map());

  // Job assignment states
  const [assignJobDialogOpen, setAssignJobDialogOpen] = useState(false);
  const [jobToAssign, setJobToAssign] = useState<Job | null>(null);
  const [selectedTechnicianId, setSelectedTechnicianId] = useState('');
  const [assignTechniciansRefreshing, setAssignTechniciansRefreshing] = useState(false);
  const [reassignTechniciansRefreshing, setReassignTechniciansRefreshing] = useState(false);
  
  // Add Team Dialog state
  const [addTeamDialogOpen, setAddTeamDialogOpen] = useState(false);
  const [jobForTeam, setJobForTeam] = useState<Job | null>(null);
  const [selectedTeamMemberId, setSelectedTeamMemberId] = useState('');
  
  // Remove Team Dialog state
  const [removeTeamDialogOpen, setRemoveTeamDialogOpen] = useState(false);
  const [jobForRemoveTeam, setJobForRemoveTeam] = useState<Job | null>(null);
  const [selectedTeamMemberToRemove, setSelectedTeamMemberToRemove] = useState('');

  useEffect(() => {
    registerAdminPWA();
    scheduleDocumentGeneratorPreload();
    // Do not disablePWA on unmount — navigating to /settings would reset manifest and break standalone.
    // PWARouteHandler disables when leaving admin app routes (public pages).
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

  // Reload technicians to get latest location data
  const reloadTechnicians = useCallback(async (options?: { transition?: boolean }) => {
    try {
      // OPTIMIZATION: Use limit to reduce data transfer
      const { data, error } = await db.technicians.getAll(100, { activeRosterOnly: true });
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
        const apply = () => {
          techniciansRef.current = transformedTechnicians;
          setTechnicians(transformedTechnicians);
        };
        if (options?.transition) {
          startTransition(apply);
        } else {
          apply();
        }
      }
    } catch (error) {
      console.error('Error reloading technicians:', error);
    }
  }, []);

  // Slim job lists embed customers without address/location JSON; hydrate full row when address dialog opens.
  useEffect(() => {
    const openCustomerIds = Object.entries(addressDialogOpen)
      .filter(([, isOpen]) => isOpen)
      .map(([id]) => id);
    if (!openCustomerIds.length) return;

    let cancelled = false;
    (async () => {
      for (const customerId of openCustomerIds) {
        const { data, error } = await db.customers.getById(customerId);
        if (cancelled || error || !data) continue;
        const transformed = transformCustomerData(data);
        if (cancelled) return;
        setCustomers((prev) => {
          const idx = prev.findIndex((c) => c.id === customerId);
          if (idx === -1) return prev;
          const next = [...prev];
          next[idx] = transformed;
          return next;
        });
        setSearchResults((prev) => {
          if (!prev?.length) return prev;
          const idx = prev.findIndex((c) => c.id === customerId);
          if (idx === -1) return prev;
          const next = [...prev];
          next[idx] = transformed;
          return next;
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [addressDialogOpen]);

  /** Fetch full customer row when opening maps from a slim list card (only runs on demand). */
  const hydrateCustomerForMaps = useCallback(async (customerId: string): Promise<Customer | null> => {
    const { data, error } = await db.customers.getById(customerId);
    if (error || !data) return null;
    const transformed = transformCustomerData(data);
    setCustomers((prev) => {
      const idx = prev.findIndex((c) => c.id === customerId);
      if (idx === -1) return prev;
      const next = [...prev];
      next[idx] = transformed;
      return next;
    });
    setSearchResults((prev) => {
      if (!prev?.length) return prev;
      const idx = prev.findIndex((c) => c.id === customerId);
      if (idx === -1) return prev;
      const next = [...prev];
      next[idx] = transformed;
      return next;
    });
    return transformed;
  }, []);

  // Reset selected technician when dialog closes
  useEffect(() => {
    if (!assignJobDialogOpen) {
      setSelectedTechnicianId('');
      setAssignTechniciansRefreshing(false);
    }
  }, [assignJobDialogOpen]);

  useEffect(() => {
    if (!reassignDialogOpen) {
      setReassignTechniciansRefreshing(false);
    }
  }, [reassignDialogOpen]);

  // Load technicians only when assign job dialog opens (not on every visibility change)
  // Technicians will be loaded when handleAssignJob is called (which opens the dialog)
  // and when user clicks refresh button in the dialog

  // Load QR codes with localStorage caching (pass force=true when completing a job — list must be fresh)
  const loadQrCodes = useCallback(async (force = false) => {
      try {
      console.log('Loading QR codes in AdminDashboard...', force ? '(force refresh)' : '');

      const cachedCommon = getCachedQrCodes();
      if (!force && cachedCommon && cachedCommon.length > 0) {
        console.log('Using cached QR codes:', cachedCommon.length, 'items');
            setCommonQrCodes(cachedCommon);
        return;
        }

      console.log('Fetching QR codes from database...');
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

  // Refresh when Settings adds/edits/deletes a common QR code (same browser)
  useEffect(() => {
    const onQrCodesUpdated = () => {
      void loadQrCodes(true);
    };
    window.addEventListener('qrCodesUpdated', onQrCodesUpdated);
    return () => window.removeEventListener('qrCodesUpdated', onQrCodesUpdated);
  }, [loadQrCodes]);

  // OPTIMIZATION: Load unique brands and models from database in parallel
  const loadBrandsAndModels = useCallback(async () => {
    try {
      // OPTIMIZATION: Fetch all 4 queries in parallel instead of sequentially
      // OPTIMIZATION: Add limits to reduce data transfer (we only need unique values, not all rows)
      // Limit to 1000 rows per query - should cover most brands/models
      const [customerBrandsResult, jobBrandsResult, customerModelsResult, jobModelsResult] = await Promise.all([
        supabase
        .from('customers')
        .select('brand')
        .not('brand', 'is', null)
        .neq('brand', '')
          .neq('brand', 'Not specified')
          .limit(1000),
        supabase
        .from('jobs')
        .select('brand')
        .not('brand', 'is', null)
        .neq('brand', '')
          .neq('brand', 'Not specified')
          .limit(1000),
        supabase
        .from('customers')
        .select('model')
        .not('model', 'is', null)
        .neq('model', '')
          .neq('model', 'Not specified')
          .limit(1000),
        supabase
        .from('jobs')
        .select('model')
        .not('model', 'is', null)
        .neq('model', '')
          .neq('model', 'Not specified')
          .limit(1000)
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
        // ignore
      } else if (data) {
        setJobCounts(data);
      }
    } catch {
      // ignore
    }
  }, []);


  const getJobsListCacheKey = useCallback((
    filter: 'COMPLETED' | 'RESCHEDULED',
    page: number
  ) => {
    return buildJobsListCacheKey(filter, page, {
      completedDatePreset,
      completedDateFilter,
      completedRangeStartDate,
      completedRangeEndDate,
    });
  }, [
    completedDatePreset,
    completedDateFilter,
    completedRangeStartDate,
    completedRangeEndDate,
  ]);

  // Load jobs based on current filter (optimized)
  const loadFilteredJobs = useCallback(async (
    filter: typeof statusFilter,
    page: number = 1,
    opts?: { silent?: boolean; cacheOnly?: boolean }
  ) => {
    const silent = opts?.silent === true;
    const cacheOnly = opts?.cacheOnly === true;
    // Only non-silent (user-visible) loads bump the request id. Background resume sync must
    // not supersede an in-flight tab switch or loading stays stuck forever.
    const requestId = silent ? loadJobsRequestRef.current : ++loadJobsRequestRef.current;
    const commitJobs = (data: Job[]) => {
      if (!cacheOnly) {
        setJobs(data);
        setTabCachesStale(false);
      } else if (filter === 'COMPLETED') {
        // Realtime warm: Completed tab can open instantly after completion sound.
        setTabCachesStale(false);
      }
      if (filter === 'ONGOING') {
        ongoingJobsSnapshotRef.current = data;
        setModuleOngoingJobsSnapshot(data);
      } else if (filter === 'COMPLETED' || filter === 'RESCHEDULED') {
        const cacheKey = getJobsListCacheKey(filter, page);
        jobsListCacheRef.current.set(cacheKey, data);
        setModuleJobsListCache(cacheKey, data);
      }
    };
    try {
      if (!silent) {
        setLoading(true);
      }
      
      if (filter === 'ALL') {
        // For ALL, we need customers with their jobs - load ongoing jobs only for display
        const { data, error } = await db.jobs.getOngoing();
        if (requestId !== loadJobsRequestRef.current) return;
        if (error) {
          if (!cacheOnly) setJobs([]);
        } else {
          if (!cacheOnly) setJobs(data || []);
        }
      } else if (filter === 'ONGOING') {
        // Load all ongoing jobs (usually not too many)
        const { data, error } = await db.jobs.getOngoing();
        if (requestId !== loadJobsRequestRef.current) return;
        if (error) {
          if (!cacheOnly) setJobs([]);
        } else {
          commitJobs(data || []);
          if (!cacheOnly) {
            setTotalCount(data?.length || 0);
            setTotalPages(1);
          }
        }
      } else if (filter === 'COMPLETED' || filter === 'CANCELLED') {
        // Use pagination for completed and denied jobs
        const statuses = filter === 'COMPLETED' ? ['COMPLETED'] : ['DENIED', 'CANCELLED'];
        // Pass date/day-range filter for completed jobs and day filter for denied jobs
        let dateFilter: string | { startDate: string; endDate: string } | undefined = undefined;
        if (filter === 'COMPLETED') {
          if (completedDatePreset === 'day') {
            dateFilter = completedDateFilter;
          } else {
            const start = completedRangeStartDate <= completedRangeEndDate ? completedRangeStartDate : completedRangeEndDate;
            const end = completedRangeStartDate <= completedRangeEndDate ? completedRangeEndDate : completedRangeStartDate;
            dateFilter = {
              startDate: start,
              endDate: end
            };
          }
        } else if (filter === 'CANCELLED') {
          dateFilter = deniedDateFilter;
        }

        let data: any[] = [];
        let error: any = null;
        let count = 0;
        let pages = 0;

        const completedClientFiltersActive =
          filter === 'COMPLETED' &&
          (completedLeadTypeFilter !== 'all' ||
            completedServiceSubTypeFilter !== 'all' ||
            completedByFilter !== 'all');

        // When lead / service / completed-by filters are on, server pagination is by raw job count but the UI
        // hides non-matching rows — so page 1 can look empty while "1/4" still shows. Load a bounded batch,
        // apply the same client filters as the list, then paginate the filtered rows.
        const COMPLETED_CLIENT_FILTER_BATCH = 5000;

        let slimResult: Awaited<ReturnType<typeof db.jobs.getByStatusPaginatedSlim>>;
        if (completedClientFiltersActive) {
          slimResult = await db.jobs.getByStatusPaginatedSlim(
            statuses,
            1,
            COMPLETED_CLIENT_FILTER_BATCH,
            dateFilter
          );
        } else {
          slimResult = await db.jobs.getByStatusPaginatedSlim(statuses, page, pageSize, dateFilter);
        }
        data = slimResult.data || [];
        error = slimResult.error;
        count = slimResult.count || 0;
        pages = slimResult.totalPages || 0;

        if (error) {
          const fallbackPage = completedClientFiltersActive ? 1 : page;
          const fallbackSize = completedClientFiltersActive ? COMPLETED_CLIENT_FILTER_BATCH : pageSize;
          const fallback = await db.jobs.getByStatusPaginated(statuses, fallbackPage, fallbackSize, dateFilter);
          data = fallback.data || [];
          error = fallback.error;
          count = fallback.count || 0;
          pages = fallback.totalPages || 0;
        }
        if (requestId !== loadJobsRequestRef.current) return;
        if (error) {
          if (!cacheOnly) setJobs([]);
        } else {
          let finalData = data || [];
          // Jobs without embedded customer (RLS/orphan rows) still need customer for grouping cards.
          if ((filter === 'COMPLETED' || filter === 'CANCELLED') && finalData.length > 0) {
            const missingIds = [
              ...new Set(
                finalData
                  .filter((j: any) => j.customer_id && !(j as any).customer)
                  .map((j: any) => j.customer_id as string)
              ),
            ];
            if (missingIds.length > 0) {
              const { data: custRows } = await supabase
                .from('customers')
                .select(CUSTOMER_ADMIN_LIST_PATCH_COLUMNS)
                .in('id', missingIds);
              const byId = new Map((custRows || []).map((row: any) => [row.id, row]));
              finalData = finalData.map((j: any) =>
                (j as any).customer || !j.customer_id ? j : { ...j, customer: byId.get(j.customer_id) ?? null }
              );
            }
          }

          if (completedClientFiltersActive) {
            const filterPayload = {
              leadType: completedLeadTypeFilter,
              serviceSubType: completedServiceSubTypeFilter,
              completedBy: completedByFilter,
            };
            const filtered = finalData.filter((j: any) =>
              completedJobMatchesDashboardClientFilters(
                j,
                filterPayload,
                techniciansRef.current as any
              )
            );
            const filteredCount = filtered.length;
            const filteredPages =
              filteredCount > 0 ? Math.ceil(filteredCount / pageSize) : 0;
            let effectivePage = page;
            if (filteredPages > 0 && page > filteredPages) effectivePage = filteredPages;
            if (filteredPages === 0) effectivePage = 1;
            finalData = filtered.slice((effectivePage - 1) * pageSize, effectivePage * pageSize);
            count = filteredCount;
            pages = filteredPages;
            if (effectivePage !== page && !cacheOnly) {
              setCurrentPage(effectivePage);
            }
          }

          if (filter === 'COMPLETED' && finalData.length > 0) {
            finalData = await enrichJobsWithAfterPhotosIfNeeded(finalData);
          }

          commitJobs(finalData);
          if (!cacheOnly) {
            setTotalCount(count || 0);
            setTotalPages(pages || 0);
          }
        }
      } else if (filter === 'RESCHEDULED') {
        // Follow-up / rescheduled: slim query + photo fields + full customer embed (low egress vs jobs.*)
        let data: any[] = [];
        let error: any = null;
        let count = 0;
        let pages = 0;
        const slimFu = await db.jobs.getByStatusPaginatedSlim(['FOLLOW_UP', 'RESCHEDULED'], page, pageSize, undefined, {
          includePhotoFields: true,
        });
        data = slimFu.data || [];
        error = slimFu.error;
        count = slimFu.count || 0;
        pages = slimFu.totalPages || 0;
        if (error) {
          const fallback = await db.jobs.getByStatusPaginated(['FOLLOW_UP', 'RESCHEDULED'], page, pageSize);
          data = fallback.data || [];
          error = fallback.error;
          count = fallback.count || 0;
          pages = fallback.totalPages || 0;
        }
        if (requestId !== loadJobsRequestRef.current) return;
        if (error) {
          if (!cacheOnly) setJobs([]);
        } else {
          commitJobs(data || []);
          if (!cacheOnly) {
            setTotalCount(count || 0);
            setTotalPages(pages || 0);
          }
        }
      }
    } catch (error) {
      if (requestId === loadJobsRequestRef.current && !cacheOnly) {
        setJobs([]);
      }
    } finally {
      if (!silent && requestId === loadJobsRequestRef.current) {
        setLoading(false);
      }
    }
  }, [
    pageSize,
    getJobsListCacheKey,
    deniedDateFilter,
    completedDateFilter,
    completedDatePreset,
    completedRangeStartDate,
    completedRangeEndDate,
    completedLeadTypeFilter,
    completedServiceSubTypeFilter,
    completedByFilter,
  ]);

  const loadCompletedJobDetails = useCallback(async (jobId: string) => {
    if (!jobId) return;
    if (loadedCompletedJobDetails[jobId]) return;
    if (loadingCompletedJobDetails[jobId]) return;
    setLoadingCompletedJobDetails((prev) => ({ ...prev, [jobId]: true }));
    try {
      const { data, error } = await db.jobs.getByIdFull(jobId);
      if (error || !data) throw error || new Error('Job not found');
      setLoadedCompletedJobDetails((prev) => ({ ...prev, [jobId]: data }));
    } catch (e) {
      console.error('Failed to load job details:', e);
      toast.error('Failed to load job details');
    } finally {
      setLoadingCompletedJobDetails((prev) => ({ ...prev, [jobId]: false }));
    }
  }, [loadedCompletedJobDetails, loadingCompletedJobDetails]);

  /** Keep embedded job.customer in sync after Edit Customer (completed tab reads email from job rows). */
  const patchCustomerContactOnJobs = useCallback(
    (
      customerId: string,
      contact: {
        email?: string | null;
        phone?: string | null;
        alternate_phone?: string | null;
        full_name?: string | null;
      },
    ) => {
      const mergeCustomer = (existing: any) => {
        if (!existing) return existing;
        const next = { ...existing };
        if (contact.email !== undefined) next.email = contact.email;
        if (contact.phone !== undefined) next.phone = contact.phone;
        if (contact.alternate_phone !== undefined) {
          next.alternate_phone = contact.alternate_phone;
          next.alternatePhone = contact.alternate_phone;
        }
        if (contact.full_name !== undefined) {
          next.full_name = contact.full_name;
          next.fullName = contact.full_name;
        }
        return next;
      };

      setJobs((prev) =>
        prev.map((job) => {
          const cid = String((job as any).customer_id || job.customerId || '');
          if (cid !== customerId) return job;
          const embedded = (job as any).customer || job.customer;
          if (!embedded) return job;
          return { ...job, customer: mergeCustomer(embedded) };
        }),
      );

      setLoadedCompletedJobDetails((prev) => {
        let touched = false;
        const next = { ...prev };
        for (const [jobId, row] of Object.entries(prev)) {
          const cid = String((row as any).customer_id || (row as any).customerId || '');
          if (cid !== customerId) continue;
          const embedded = (row as any).customer;
          if (!embedded) continue;
          next[jobId] = { ...row, customer: mergeCustomer(embedded) };
          touched = true;
        }
        return touched ? next : prev;
      });
    },
    [],
  );

  const applyListCustomerContactToCachedJob = (cached: any, listJob: any) => {
    const listCustomer = listJob?.customer;
    if (!listCustomer) return cached;
    const mergedCustomer = cached.customer
      ? {
          ...cached.customer,
          email: listCustomer.email ?? cached.customer.email,
          phone: listCustomer.phone ?? cached.customer.phone,
          alternate_phone:
            listCustomer.alternate_phone ??
            listCustomer.alternatePhone ??
            cached.customer.alternate_phone,
          alternatePhone:
            listCustomer.alternatePhone ??
            listCustomer.alternate_phone ??
            cached.customer.alternatePhone,
          full_name: listCustomer.full_name ?? listCustomer.fullName ?? cached.customer.full_name,
          fullName: listCustomer.fullName ?? listCustomer.full_name ?? cached.customer.fullName,
        }
      : listCustomer;
    return { ...cached, customer: mergedCustomer };
  };

  const applyAdminSnapshot = useCallback((snap: AdminDashboardSnapshot) => {
    const jobList = (snap.jobs as Job[]) ?? [];
    setJobs(jobList);
    ongoingJobsSnapshotRef.current = jobList;
    setModuleOngoingJobsSnapshot(jobList);
    setTotalCount(jobList.length);
    setTotalPages(1);
    const transformed = (snap.technicianRows as any[]).map(transformTechnicianData);
    techniciansRef.current = transformed;
    setTechnicians(transformed);
    setJobCounts(snap.jobCounts);
  }, []);

  const loadDashboardSecondary = useCallback(async () => {
    try {
      const [techniciansAllResult, amcContractsResult, priorCompletedMap] = await Promise.all([
        db.technicians.getList(500, { activeRosterOnly: false }),
        supabase.from('amc_contracts').select('customer_id, status').eq('status', 'ACTIVE'),
        fetchCustomerIdsWithCompletedJobsMap(),
      ]);

      const amcStatusMap: Record<string, boolean> = {};
      if (amcContractsResult.data) {
        amcContractsResult.data.forEach((amc: any) => {
          amcStatusMap[amc.customer_id] = true;
        });
      }
      setCustomerAMCStatus(amcStatusMap);
      setCustomerPriorServiceStatus((prev) => ({ ...prev, ...priorCompletedMap }));

      if (techniciansAllResult?.data) {
        setTechniciansForReports(techniciansAllResult.data.map(transformTechnicianData));
      }

      void loadBrandsAndModels();
      void db.jobs
        .getFollowUpForGlow()
        .then(({ data }) => {
          if (data) setAllFollowUpJobs(data as Job[]);
        })
        .catch(() => setAllFollowUpJobs([]));
    } catch (e) {
      console.warn('[AdminDashboard] Secondary load failed:', e);
    }
  }, []);

  const amcAutoCreateAttemptedRef = useRef(false);
  const followUpPromoteDayRef = useRef<string | null>(null);

  const scheduleFollowUpPromotion = useCallback(() => {
    const today = getTodayLocalDate();
    if (followUpPromoteDayRef.current === today) return;
    followUpPromoteDayRef.current = today;

    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (!session) {
          followUpPromoteDayRef.current = null;
          return;
        }
        db.jobs.promoteDueFollowUpsToOngoing(today).then((result) => {
          if (result.error) {
            console.error('Error promoting due follow-up jobs:', result.error);
            followUpPromoteDayRef.current = null;
            return;
          }
          if (result.promoted > 0) {
            toast.success(
              `${result.promoted} follow-up job${result.promoted > 1 ? 's' : ''} moved to ongoing`
            );
            invalidateAdminDashboardCaches();
            clearModuleJobsListCache();
            loadFilteredJobs(statusFilter, currentPage, { silent: true });
            db.jobs.getFollowUpForGlow().then(({ data }) => {
              if (data) setAllFollowUpJobs(data as Job[]);
            }).catch(() => {});
          }
        });
      })
      .catch(() => {
        followUpPromoteDayRef.current = null;
      });
  }, [statusFilter, currentPage, loadFilteredJobs]);

  const scheduleAmcJobCreation = useCallback(() => {
    if (amcAutoCreateAttemptedRef.current) return;
    amcAutoCreateAttemptedRef.current = true;

    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (!session) {
          amcAutoCreateAttemptedRef.current = false;
          return;
        }
        db.amcContracts.createAMCServiceJobs().then((result) => {
          if (result.error) {
            console.error('Error creating AMC service jobs:', result.error);
            amcAutoCreateAttemptedRef.current = false;
          } else if (result.created > 0) {
            toast.success(
              `Created ${result.created} AMC service job${result.created > 1 ? 's' : ''} automatically`
            );
            loadFilteredJobs(statusFilter, currentPage);
          }
        });
      })
      .catch(() => {
        amcAutoCreateAttemptedRef.current = false;
      });
  }, [statusFilter, currentPage, loadFilteredJobs]);

  const loadDashboardData = async (options?: {
    silent?: boolean;
    skipOngoingFetch?: boolean;
    skipTechniciansFetch?: boolean;
  }) => {
    const silent = options?.silent === true;
    const skipOngoingFetch = options?.skipOngoingFetch === true;
    // When the roster was just applied from a fresh live prefetch, skip the
    // immediate re-fetch — the `get_technicians_for_admin` RPC otherwise runs
    // twice on every cold boot (once in the prefetch, once here).
    const skipTechniciansFetch = options?.skipTechniciansFetch === true;
    try {
      if (!silent) {
        setLoading(true);
      }

      if (!silent) {
        const sessionReady = await ensureAdminSupabaseSession();
        if (!sessionReady) {
          console.warn('[AdminDashboard] Skipping load — admin Supabase session not ready yet');
          return;
        }
      }

      scheduleAmcJobCreation();
      scheduleFollowUpPromotion();

      const [techniciansResult, jobCountsResult, ongoingResult] = await Promise.all([
        skipTechniciansFetch
          ? Promise.resolve({ data: null as Technician[] | null, error: null })
          : db.technicians.getAllForDashboard(100),
        db.jobs.getCounts(),
        skipOngoingFetch && statusFilter === 'ONGOING'
          ? Promise.resolve({ data: null as Job[] | null, error: null })
          : statusFilter === 'ONGOING'
            ? db.jobs.getOngoing(100)
            : Promise.resolve({ data: null, error: null }),
      ]);

      if (jobCountsResult.data) {
        setJobCounts(jobCountsResult.data);
      }

      if (techniciansResult.data) {
        const transformedTechnicians = techniciansResult.data.map(transformTechnicianData);
        techniciansRef.current = transformedTechnicians;
        setTechnicians(transformedTechnicians);
      } else if (techniciansResult.error) {
        console.error('Failed to load technicians:', techniciansResult.error);
        techniciansRef.current = [];
        setTechnicians([]);
      }

      if (!skipOngoingFetch && statusFilter === 'ONGOING' && ongoingResult) {
        if (ongoingResult.error) {
          setJobs([]);
        } else {
          const list = ongoingResult.data || [];
          setJobs(list);
          ongoingJobsSnapshotRef.current = list;
          setModuleOngoingJobsSnapshot(list);
          setTotalCount(list.length);
          setTotalPages(1);
        }
      } else if (!skipOngoingFetch && statusFilter !== 'ONGOING') {
        await loadFilteredJobs(statusFilter, currentPage, { silent: true });
      }

      const jobsForCache =
        skipOngoingFetch && statusFilter === 'ONGOING'
          ? undefined
          : statusFilter === 'ONGOING'
            ? ongoingResult?.data ?? []
            : undefined;

      if (jobsForCache && techniciansResult.data) {
        writeAdminDashboardCache({
          savedAt: Date.now(),
          jobs: jobsForCache,
          technicianRows: techniciansResult.data,
          jobCounts: jobCountsResult.data ?? {
            ongoing: 0,
            followup: 0,
            denied: 0,
            completed: 0,
          },
        });
      }

      void loadDashboardSecondary();
    } catch (error) {
      if (!silent) {
        toast.error(
          `Failed to load dashboard data: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  const [isInitialLoad, setIsInitialLoad] = useState(
    () =>
      !getModuleDashboardSessionReady() &&
      !initialDashboardCache &&
      restoredJobs.length === 0 &&
      initialOngoingJobs.length === 0
  );
  const dashboardLoadedWithSessionRef = useRef(false);
  const adminRealtimeStatusRef = useRef<string | null>(null);
  const loadDashboardDataRef = useRef(loadDashboardData);
  loadDashboardDataRef.current = loadDashboardData;

  const runDashboardLoadOnceSessionReady = useCallback(async () => {
    if (dashboardLoadedWithSessionRef.current) return;

    if (getModuleDashboardSessionReady()) {
      const cached = readAdminDashboardCache();
      if (cached) {
        applyAdminSnapshot(cached);
      }
      setIsInitialLoad(false);
      setLoading(false);
      dashboardLoadedWithSessionRef.current = true;
      try {
        await loadDashboardDataRef.current({
          silent: true,
          skipOngoingFetch: statusFilter === 'ONGOING',
          skipTechniciansFetch: Boolean(cached?.technicianRows?.length),
        });
      } catch (error) {
        console.error('[AdminDashboard] Resume load failed:', error);
      }
      return;
    }

    let showedInstantData = false;
    // True only when the roster/jobs came from the live prefetch (fresh, <1s old)
    // rather than the sessionStorage snapshot (which can be up to 5 min stale and
    // therefore must still be refreshed by loadDashboardData).
    let appliedFreshPrefetch = false;
    const cached = readAdminDashboardCache();
    if (cached) {
      applyAdminSnapshot(cached);
      showedInstantData = true;
      setIsInitialLoad(false);
      setLoading(false);
    } else {
      setLoading(true);
      setIsInitialLoad(true);
    }

    const sessionOk = await ensureAdminSupabaseSession(1_500);
    if (!sessionOk) {
      toast.error('Could not start your session. Please try again or refresh the page.');
      setLoading(false);
      setIsInitialLoad(false);
      return;
    }

    if (!showedInstantData) {
      const prefetched = await consumeAdminDashboardPrefetch();
      if (prefetched) {
        applyAdminSnapshot(prefetched);
        showedInstantData = true;
        appliedFreshPrefetch = true;
        setIsInitialLoad(false);
        setLoading(false);
      }
    }

    try {
      await loadDashboardDataRef.current({
        silent: true,
        skipOngoingFetch: showedInstantData && statusFilter === 'ONGOING',
        // Roster is identical to what the prefetch just fetched — skip the
        // duplicate get_technicians_for_admin RPC on this cold boot.
        skipTechniciansFetch: appliedFreshPrefetch,
      });
      dashboardLoadedWithSessionRef.current = true;
      setModuleDashboardSessionReady(true);
    } catch (error) {
      console.error('[AdminDashboard] Initial load failed:', error);
    } finally {
      setIsInitialLoad(false);
      setLoading(false);
    }
  }, [applyAdminSnapshot, statusFilter]);

  // Load dashboard only after admin JWT is ready (RLS on customers requires authenticated admin)
  useEffect(() => {
    if (authInitializing || !user || !isAdmin) return;
    void runDashboardLoadOnceSessionReady();
  }, [authInitializing, user?.id, isAdmin, runDashboardLoadOnceSessionReady]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        dashboardLoadedWithSessionRef.current = false;
        setModuleDashboardSessionReady(false);
        amcAutoCreateAttemptedRef.current = false;
        clearAdminDashboardCache();
        setIsInitialLoad(true);
        setLoading(true);
        return;
      }
      if (
        (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') &&
        session?.user
      ) {
        const role =
          session.user.app_metadata?.role ??
          session.user.user_metadata?.role ??
          'admin';
        if (role !== 'technician') {
          void runDashboardLoadOnceSessionReady();
        }
      }
    });
    return () => subscription.unsubscribe();
  }, [runDashboardLoadOnceSessionReady]);

  // Check URL parameters for navigation from Settings page (re-run when search changes).
  useEffect(() => {
    if (!location.pathname.startsWith('/admin')) return;

    const searchParams = new URLSearchParams(location.search);

    // Full-page views (?view=…) and ?search= are handled by dedicated URL sync effects.
    const viewParam = searchParams.get('view');
    if (
      isAdminOverlayViewParam(viewParam) ||
      isAdminTabViewParam(viewParam) ||
      isAdminToolParam(searchParams.get('tool')) ||
      isAdminModalSlug(searchParams.get('modal')) ||
      searchParams.get('search')
    ) {
      return;
    }

    if (searchParams.get('composeEmail')) {
      const customerId = searchParams.get('composeEmail');
      const templateParam = searchParams.get('emailTemplate') as AdminEmailTemplateType | null;
      const allowedTemplates: AdminEmailTemplateType[] = [
        'booking_confirmation',
        'service_bill',
        'amc_document',
        'invoice',
        'quotation',
        'service_reminder',
        'general',
      ];
      setEmailComposerCustomerId(customerId && customerId !== '1' ? customerId : null);
      setEmailComposerJobId(null);
      setEmailComposerContext('default');
      if (templateParam && allowedTemplates.includes(templateParam)) {
        setEmailComposerTemplate(templateParam);
      } else {
        setEmailComposerTemplate('general');
      }
      setEmailComposerOpen(true);
      navigate('/admin', { replace: true });
    } else if (searchParams.get('composeEmailJob')) {
      const jobId = searchParams.get('composeEmailJob');
      if (jobId) {
        setEmailComposerJobId(jobId);
        setEmailComposerCustomerId(null);
        setEmailComposerTemplate('job_completion');
        setEmailComposerContext('completed_job');
        setEmailComposerOpen(true);
      }
      navigate('/admin', { replace: true });
    } else if (searchParams.get('composeWhatsApp')) {
      const customerId = searchParams.get('composeWhatsApp');
      const templateParam = searchParams.get('whatsappTemplate') as AdminEmailTemplateType | null;
      const allowedTemplates: AdminEmailTemplateType[] = [
        'booking_confirmation',
        'service_bill',
        'amc_document',
        'invoice',
        'quotation',
        'service_reminder',
        'general',
      ];
      setWhatsappComposerCustomerId(customerId && customerId !== '1' ? customerId : null);
      if (templateParam && allowedTemplates.includes(templateParam)) {
        setWhatsappComposerTemplate(templateParam);
      } else {
        setWhatsappComposerTemplate('general');
      }
      setWhatsappComposerOpen(true);
      navigate('/admin', { replace: true });
    }
  }, [location.pathname, location.search, navigate]);

  const assignTechLoadForJobRef = useRef<string | null>(null);

  completeDialogOpenRef.current = completeDialogOpen;

  const resolveCustomerForModal = useCallback(
    (customerId: string | null): Customer | null => {
      if (!customerId) return null;
      const fromSearch = searchResults?.find((c) => c.id === customerId);
      if (fromSearch) return fromSearch;
      const fromList = customers.find((c) => c.id === customerId);
      if (fromList) return fromList;
      for (const j of jobs) {
        const raw = (j as any).customer || j.customer;
        if (raw?.id === customerId) return transformCustomerData(raw);
      }
      return null;
    },
    [searchResults, customers, jobs]
  );

  // Job-list modals (?modal=) — swipe-back closes overlay instead of exiting the PWA.
  useEffect(() => {
    if (!location.pathname.startsWith('/admin')) return;

    const parsed = parseAdminDashboardUrl(location.search);
    const modal = parsed.modal;
    const prevModal = prevAdminModalRef.current;

    if (prevModal && !modal) {
      const y = adminListScrollYRef.current;
      if (y != null) {
        adminListScrollYRef.current = null;
        scheduleAdminScrollRestore(y);
      }
    }
    prevAdminModalRef.current = modal;

    const job =
      parsed.jobId != null ? jobs.find((j) => j.id === parsed.jobId) ?? null : null;

    const resolveCustomer = resolveCustomerForModal;

    setAssignJobDialogOpen(modal === 'assign' && !!job);
    setReassignDialogOpen(modal === 'reassign' && !!job);
    setEditJobDialogOpen(modal === 'edit-job' && !!job);
    setEditCompletedJobDialogOpen(modal === 'edit-completed' && !!job);
    setFollowUpModalOpen(modal === 'follow-up' && !!job);
    setDenyDialogOpen(modal === 'deny' && !!job);
    setMoveToOngoingDialogOpen(modal === 'move-ongoing' && !!job);
    setSendMessageDialogOpen(modal === 'send-message' && !!job);
    setDeleteJobDialogOpen(modal === 'delete-job' && !!job);
    setShareTechnicianInfoDialogOpen(modal === 'share-job-info' && !!job);
    setAddReminderDialogOpen(modal === 'add-reminder' && !!resolveCustomer(parsed.customerId));
    setOngoingFilterDialogOpen(modal === 'ongoing-filters');
    setCompletedFilterDialogOpen(modal === 'completed-filters');
    setPhotoGalleryOpen(modal === 'photos' && !!job);
    setPhotoViewerOpen(modal === 'photo-viewer');
    if (modal !== 'photo-viewer') {
      setSelectedPhoto(null);
      setSelectedBillPhotos(null);
      setPhotoDownloadMeta(null);
      if (modal !== 'customer-photos') {
        setSelectedCustomerPhotos(null);
      }
    }
    setCustomerPhotoGalleryOpen(modal === 'customer-photos' && !!resolveCustomer(parsed.customerId));
    setCustomerReportDialogOpen(modal === 'report' && !!resolveCustomer(parsed.customerId));
    setHistoryDialogOpen(modal === 'history' && !!resolveCustomer(parsed.customerId));
    setBillModalOpen(modal === 'bill' && !!resolveCustomer(parsed.customerId));
    setEditDialogOpen(modal === 'edit-customer' && !!resolveCustomer(parsed.customerId));
    setAddDialogOpen(modal === 'add-customer');
    setNewJobDialogOpen(modal === 'new-job' && !!resolveCustomer(parsed.customerId));
    setWhatsappDialogOpen(modal === 'whatsapp');

    if (!modal) {
      setTechnicianSelectDialogOpen(false);
      setCompleteDialogOpen(false);
    }

    if (modal === 'assign' && job) {
      setJobToAssign(job);
      if (assignTechLoadForJobRef.current !== job.id) {
        assignTechLoadForJobRef.current = job.id;
        setAssignTechniciansRefreshing(true);
        void reloadTechnicians({ transition: true }).finally(() =>
          setAssignTechniciansRefreshing(false)
        );
      }
    } else if (modal === 'reassign' && job) {
      setJobToReassign(job);
      if (assignTechLoadForJobRef.current !== job.id) {
        assignTechLoadForJobRef.current = job.id;
        setReassignTechniciansRefreshing(true);
        void reloadTechnicians({ transition: true }).finally(() =>
          setReassignTechniciansRefreshing(false)
        );
      }
    } else if (modal !== 'assign' && modal !== 'reassign') {
      assignTechLoadForJobRef.current = null;
    }

    if (modal === 'complete' && job) {
      setSelectedJobForComplete(job);
      if (!completeDialogOpenRef.current) {
        setTechnicianSelectDialogOpen(true);
      }
    }
    if (modal === 'edit-job' && job) setJobToEdit(job);
    if (modal === 'edit-completed' && job) setSelectedCompletedJob(job);
    if (modal === 'follow-up' && job) setSelectedJobForFollowUp(job);
    if (modal === 'deny' && job) setSelectedJobForDeny(job);
    if (modal === 'move-ongoing' && job) setSelectedJobForMoveToOngoing(job);
    if (modal === 'send-message' && job) setSelectedJobForMessage(job);
    if (modal === 'delete-job' && job) setJobToDelete(job);
    if (modal === 'share-job-info' && job) setSelectedJobForShareInfo(job);
    if (modal !== 'share-job-info') {
      setSelectedJobForShareInfo(null);
    }

    setWarrantyDialogOpen(modal === 'warranty' && !!resolveCustomer(parsed.customerId));

    const customerForModal = resolveCustomer(parsed.customerId);
    const openingModal = modal !== null && prevModal !== modal;

    if (modal === 'add-reminder' && customerForModal) {
      setReminderEntity({ type: 'customer', id: customerForModal.id });
      setReminderContextLabel(
        `${(customerForModal as any).full_name || customerForModal.fullName || 'Customer'} (Customer)`
      );
    }
    if (modal === 'customer-photos' && customerForModal) {
      setSelectedCustomerForPhotos((prev) =>
        prev?.id === customerForModal.id ? prev : customerForModal
      );
      if (openingModal) {
        const customerCode = customerForModal.customer_id || customerForModal.customerId;
        if (customerCode) void loadCustomerPhotos(customerCode);
      }
    }
    if (modal === 'report' && customerForModal) {
      setSelectedCustomerForReport((prev) =>
        prev?.id === customerForModal.id ? prev : customerForModal
      );
      if (openingModal) {
        void (async () => {
          const c = await loadFullCustomerForAction(customerForModal);
          setSelectedCustomerForReport(c);
          const customerUuid = c.id;
          if (!customerUuid) return;
          try {
            const { data: completedRows } = await db.jobs.getByCustomerIdForReport(customerUuid);
            if (completedRows?.length) {
              setCustomerPriorServiceStatus((prev) => ({ ...prev, [customerUuid]: true }));
              setCustomers((prev) =>
                prev.map((row) =>
                  row.id === customerUuid
                    ? {
                        ...row,
                        lastServiceDate:
                          row.lastServiceDate ||
                          (c as any).last_service_date ||
                          new Date().toISOString().split('T')[0],
                      }
                    : row
                )
              );
            }
          } catch {
            /* report dialog still opens */
          }
        })();
      }
    }
    if (modal === 'history' && customerForModal) {
      setSelectedCustomerForHistory((prev) =>
        prev?.id === customerForModal.id ? prev : customerForModal
      );
      if (openingModal) {
        const customerCode = customerForModal.customer_id || customerForModal.customerId;
        if (customerCode) void loadCustomerHistory(customerCode);
      }
    }
    if (modal === 'bill' && customerForModal) {
      setSelectedCustomerForBill((prev) =>
        prev?.id === customerForModal.id ? prev : customerForModal
      );
      if (openingModal) {
        void loadFullCustomerForAction(customerForModal).then(setSelectedCustomerForBill);
      }
    }
    if (modal === 'edit-customer' && customerForModal) {
      setEditingCustomer((prev) =>
        prev?.id === customerForModal.id ? prev : customerForModal
      );
      if (openingModal) {
        void loadFullCustomerForAction(customerForModal).then(setEditingCustomer);
      }
    }
    if (modal === 'new-job' && customerForModal) {
      setSelectedCustomerForJob((prev) =>
        prev?.id === customerForModal.id ? prev : customerForModal
      );
      if (openingModal) {
        void loadFullCustomerForAction(customerForModal).then(setSelectedCustomerForJob);
      }
    }
    if (modal === 'warranty' && customerForModal) {
      setWarrantyDialogCustomer({
        id: customerForModal.id,
        customer_id: customerForModal.customer_id || (customerForModal as any).customerId || '',
        full_name: customerForModal.fullName || (customerForModal as any).full_name || '',
        phone: customerForModal.phone || '',
        model: (customerForModal as any).model || '',
        brand: (customerForModal as any).brand || '',
        visible_address: (customerForModal as any).visible_address || '',
      });
    }

    if (modal === 'photos' && job && parsed.photoType) {
      const requirements = parseJobRequirements((job as any).requirements || job.requirements);
      const fromReq = requirements.find((r: any) => r?.[`${parsed.photoType}_photos`]);
      const rawPhotos =
        fromReq?.[`${parsed.photoType}_photos`] ??
        (job as any)[`${parsed.photoType}_photos`] ??
        (job as any)[`${parsed.photoType}Photos`] ??
        [];
      const validPhotos = extractPhotoUrls(Array.isArray(rawPhotos) ? rawPhotos : []);
      if (validPhotos.length > 0) {
        setSelectedJobPhotos({ jobId: job.id, photos: validPhotos, type: parsed.photoType });
      }
    }
  }, [location.pathname, location.search, jobs, customers, resolveCustomerForModal]);

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

  // Derive customers from loaded jobs only (no full customer load)
  const deriveCustomersFromJobs = (jobsList: Job[]) => {
    const seen = new Set<string>();
    const list: Customer[] = [];
    for (const job of jobsList) {
      const raw = (job as any).customer || job.customer;
      if (!raw?.id) continue;
      if (seen.has(raw.id)) continue;
      seen.add(raw.id);
      list.push(transformCustomerData(raw));
    }
    return list;
  };
  useEffect(() => {
    setCustomers((prev) => {
      const derived = deriveCustomersFromJobs(jobs);
      const derivedIds = new Set(derived.map((c) => c.id));
      const pending = pendingNewCustomersRef.current;
      for (const id of [...pending.keys()]) {
        if (derivedIds.has(id)) pending.delete(id);
      }
      const extras = [...pending.values()].filter((c) => !derivedIds.has(c.id));
      if (extras.length === 0) {
        return derived;
      }
      const seen = new Set<string>();
      const merged: Customer[] = [];
      for (const c of extras) {
        if (!seen.has(c.id)) {
          seen.add(c.id);
          merged.push(c);
        }
      }
      for (const c of derived) {
        if (!seen.has(c.id)) {
          seen.add(c.id);
          merged.push(c);
        }
      }
      return merged;
    });
  }, [jobs]);

  // Recent Accounts: scoped fetch when dialog opens (large-scale pattern – no full customer load)
  useEffect(() => {
    if (!recentAccountsDialogOpen) return;
    setLoadingRecentAccounts(true);
    db.customers.getCreatedToday(100)
      .then(({ data, error }) => {
        if (error) {
          console.error('Error fetching recent accounts:', error);
          setRecentAccountsToday([]);
        } else {
          setRecentAccountsToday((data || []).map((row: any) => transformCustomerData(row)));
        }
      })
      .finally(() => setLoadingRecentAccounts(false));
  }, [recentAccountsDialogOpen]);

  // Reload jobs when filter changes (but not on initial load)
  useEffect(() => {
    if (isInitialLoad) return;

    const prevFilter = prevStatusFilterRef.current;
    const filterChanged = prevFilter !== null && prevFilter !== statusFilter;
    prevStatusFilterRef.current = statusFilter;

    const page = filterChanged ? 1 : currentPage;
    if (filterChanged) {
      setCurrentPage(1);
    }

    if (statusFilter === 'COMPLETED' || statusFilter === 'RESCHEDULED') {
      if (!tabCachesStale) {
        const cacheKey = getJobsListCacheKey(statusFilter, page);
        const cached =
          jobsListCacheRef.current.get(cacheKey) ??
          (getModuleJobsListCache(cacheKey) as Job[] | undefined);
        setJobs(cached ?? []);
      } else {
        setJobs([]);
      }
    } else if (statusFilter === 'ONGOING') {
      if (!tabCachesStale) {
        const snapshot =
          ongoingJobsSnapshotRef.current.length > 0
            ? ongoingJobsSnapshotRef.current
            : (getModuleOngoingJobsSnapshot() as Job[]);
        if (snapshot.length > 0) {
          setJobs(snapshot);
        } else if (!jobsMatchOngoingTab(jobs)) {
          setJobs([]);
        }
      } else if (!jobsMatchOngoingTab(jobs)) {
        setJobs([]);
      }
    } else if (filterChanged) {
      // Denied / All: clear the previous tab's jobs so they don't flash before the fetch lands.
      setJobs([]);
    }
    loadFilteredJobs(statusFilter, page);
    // Refresh counts when filter changes
      loadJobCounts();
  }, [statusFilter, loadFilteredJobs, loadJobCounts, isInitialLoad, getJobsListCacheKey, tabCachesStale]);

  const resumeAdminSync = useCallback(async (opts?: { invalidateTabCaches?: boolean }) => {
    if (isInitialLoad || !dashboardLoadedWithSessionRef.current) return;

    const session = await ensureSupabaseSessionForWrite();
    if (!session.ok) {
      console.warn('[AdminDashboard] Resume sync skipped — session not ready');
      return;
    }

    const invalidate = opts?.invalidateTabCaches === true;
    if (invalidate) {
      clearModuleJobsListCache();
      jobsListCacheRef.current.clear();
      setTabCachesStale(true);
      setIsResumeListSyncing(true);
      if (statusFilter !== 'ONGOING') {
        setJobs([]);
      }
    }

    try {
      await Promise.all([
        loadJobCounts(),
        loadFilteredJobs(statusFilter, currentPage, { silent: true }),
        db.jobs.getFollowUpForGlow().then(({ data }) => {
          if (data) setAllFollowUpJobs(data as Job[]);
        }).catch(() => {}),
      ]);
    } finally {
      if (invalidate) {
        setIsResumeListSyncing(false);
      }
    }
  }, [isInitialLoad, statusFilter, currentPage, loadJobCounts, loadFilteredJobs]);

  const resumeAdminSyncRef = useRef(resumeAdminSync);
  resumeAdminSyncRef.current = resumeAdminSync;

  useResumeSync({
    enabled: !authInitializing && !!user && isAdmin && !isInitialLoad,
    minHiddenMs: 60_000,
    minIntervalMs: 15_000,
    onResume: () => resumeAdminSync({ invalidateTabCaches: true }),
  });

  // Reload jobs when denied date filter changes
  useEffect(() => {
    if (isInitialLoad) return;
    if (statusFilter === 'CANCELLED') {
      setCurrentPage(1); // Reset to first page when date filter changes
      loadFilteredJobs(statusFilter, 1);
    }
  }, [deniedDateFilter, statusFilter, loadFilteredJobs, isInitialLoad]);

  // Reload jobs when completed date/range filter changes
  useEffect(() => {
    if (isInitialLoad) return;
    if (statusFilter === 'COMPLETED') {
      setCurrentPage(1); // Reset to first page when date filter changes
      loadFilteredJobs(statusFilter, 1);
    }
  }, [completedDateFilter, completedDatePreset, completedRangeStartDate, completedRangeEndDate, statusFilter, loadFilteredJobs, isInitialLoad]);

  // Load full option source for completed filters (not limited to current page)
  useEffect(() => {
    if (isInitialLoad || statusFilter !== 'COMPLETED' || !completedFilterDialogOpen) return;
    const loadCompletedFilterSource = async () => {
      // Egress optimization: only fetch a bounded window for dropdown options.
      // This keeps the dropdowns useful while avoiding pulling thousands of historical rows.
      let dateFilter: string | { startDate: string; endDate: string } | undefined = undefined;
      if (completedDatePreset === 'day') {
        dateFilter = completedDateFilter;
      } else {
        const start = completedRangeStartDate <= completedRangeEndDate ? completedRangeStartDate : completedRangeEndDate;
        const end = completedRangeStartDate <= completedRangeEndDate ? completedRangeEndDate : completedRangeStartDate;
        dateFilter = { startDate: start, endDate: end };
      }
      const { data } = await db.jobs.getCompletedJobsFilterSource(dateFilter, 1200);
      setCompletedFilterSourceJobs(data || []);
    };
    loadCompletedFilterSource();
  }, [
    isInitialLoad,
    statusFilter,
    completedFilterDialogOpen,
    completedDatePreset,
    completedDateFilter,
    completedRangeStartDate,
    completedRangeEndDate,
  ]);

  useEffect(() => {
    if (!completedFilterDialogOpen) return;
    setDraftCompletedDatePreset(completedDatePreset);
    setDraftCompletedDateFilter(completedDateFilter);
    setDraftCompletedRangeStartDate(completedRangeStartDate);
    setDraftCompletedRangeEndDate(completedRangeEndDate);
    setDraftCompletedLeadTypeFilter(completedLeadTypeFilter);
    setDraftCompletedServiceSubTypeFilter(completedServiceSubTypeFilter);
    setDraftCompletedByFilter(completedByFilter);
  }, [
    completedFilterDialogOpen,
    completedDatePreset,
    completedDateFilter,
    completedRangeStartDate,
    completedRangeEndDate,
    completedLeadTypeFilter,
    completedServiceSubTypeFilter,
    completedByFilter
  ]);

  // Reset to first page when completed sub-filters change. Lead / service / completed-by are client-side;
  // for a single day with one page of results, skip refetch (same jobs; doesCompletedJobMatchFilters narrows UI).
  useEffect(() => {
    if (isInitialLoad || statusFilter !== 'COMPLETED') return;
    setCurrentPage(1);
    const completedSingleDay =
      completedDatePreset === 'day' ||
      (completedDatePreset === 'custom' &&
        completedRangeStartDate === completedRangeEndDate);
    if (completedSingleDay && totalPages === 1) {
      return;
    }
    loadFilteredJobs(statusFilter, 1);
  }, [
    completedLeadTypeFilter,
    completedServiceSubTypeFilter,
    completedByFilter,
    isInitialLoad,
    statusFilter,
    loadFilteredJobs,
    totalPages,
  ]);

  // Restore scroll position when WhatsApp dialog opens (after assign/reassign) so page doesn't jump to top
  useEffect(() => {
    if (whatsappDialogOpen && scrollPositionBeforeWhatsAppRef.current > 0) {
      const saved = scrollPositionBeforeWhatsAppRef.current;
      const id = requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.scrollTo(0, saved);
        });
      });
      return () => cancelAnimationFrame(id);
    }
  }, [whatsappDialogOpen]);

  // Load customer history function - defined early for use in useEffect.
  // Paginated to keep egress bounded for customers with many jobs (e.g. the shared
  // walk-in / office-sale customer). `append` loads the next page and adds to the list.
  const loadCustomerHistory = useCallback(async (customerId: string, append: boolean = false) => {
    try {
      // Get customer by customer_id to get UUID
      const { data: customer, error: customerError } = await db.customers.getByCustomerId(customerId);
      
      if (customerError || !customer) {
        toast.error('Customer not found');
        return;
      }

      const offset = append ? (customerHistory[customerId]?.length || 0) : 0;
      const { data: customerJobs, hasMore, error: jobsError } = await db.jobs.getByCustomerIdSlimPaged(
        customer.id,
        SERVICE_HISTORY_PAGE_SIZE,
        offset
      );
      
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

      setHistoryHasMore(hasMore);
      setCustomerHistory(prev => {
        const combined = append ? [...(prev[customerId] || []), ...enrichedJobs] : enrichedJobs;
        // De-dupe by id (in case of overlap) and sort by date (newest first)
        const byId = new Map<string, Job>();
        for (const j of combined) {
          if (j?.id) byId.set(j.id, j);
        }
        const deduped = [...byId.values()].sort((a, b) => {
          const dateA = new Date(a.completedAt || a.scheduledDate || a.createdAt || 0).getTime();
          const dateB = new Date(b.completedAt || b.scheduledDate || b.createdAt || 0).getTime();
          return dateB - dateA;
        });
        return { ...prev, [customerId]: deduped };
      });
    } catch (error) {
      console.error('Error loading customer history:', error);
      toast.error('Failed to load service history');
    }
  }, [technicians, customerHistory]);

  const loadMoreCustomerHistory = useCallback(async () => {
    if (!selectedCustomerForHistory || historyLoadingMore) return;
    const customerId = selectedCustomerForHistory.customer_id || selectedCustomerForHistory.customerId;
    if (!customerId) return;
    setHistoryLoadingMore(true);
    try {
      await loadCustomerHistory(customerId, true);
    } finally {
      setHistoryLoadingMore(false);
    }
  }, [selectedCustomerForHistory, historyLoadingMore, loadCustomerHistory]);

  // Egress optimization: do NOT prefetch full customer history for every customer in COMPLETED view.
  // Service history is fetched on-demand when the user clicks "View History" (see handleViewHistory).

  // Reload jobs when page changes (for paginated views)
  useEffect(() => {
    if (statusFilter === 'COMPLETED' || statusFilter === 'CANCELLED' || statusFilter === 'RESCHEDULED') {
      loadFilteredJobs(statusFilter, currentPage);
    }
  }, [currentPage, statusFilter, loadFilteredJobs]);

  // Initialize audio context on first user interaction (required for sound on hosted)
  useEffect(() => {
    const handleUserInteraction = async () => {
      try {
        const Ac = window.AudioContext || (window as any).webkitAudioContext;
        if (!Ac) return;
        if (audioContextRef.current?.state === 'closed') {
          audioContextRef.current = null;
        }
        if (!audioContextRef.current) {
          audioContextRef.current = new Ac();
        }
        const ctx = audioContextRef.current;
        if (ctx.state === 'suspended') {
          await ctx.resume();
        }
      } catch {
        // ignore
      }
      document.removeEventListener('click', handleUserInteraction);
      document.removeEventListener('keydown', handleUserInteraction);
      document.removeEventListener('pointerdown', handleUserInteraction);
      document.removeEventListener('touchstart', handleUserInteraction);
    };
    document.addEventListener('click', handleUserInteraction, { once: true });
    document.addEventListener('keydown', handleUserInteraction, { once: true });
    // Mobile/PWA: click may not fire reliably; prime on pointer/touch too.
    document.addEventListener('pointerdown', handleUserInteraction, { once: true });
    document.addEventListener('touchstart', handleUserInteraction, { once: true });
    return () => {
      document.removeEventListener('click', handleUserInteraction);
      document.removeEventListener('keydown', handleUserInteraction);
      document.removeEventListener('pointerdown', handleUserInteraction);
      document.removeEventListener('touchstart', handleUserInteraction);
    };
  }, []);

  // Track EVERY scheduled alert oscillator (not just the latest). Rapid intent
  // events can start several plays; if we only kept the last one, earlier
  // oscillators became orphans that beeped for their full duration with nothing
  // able to stop them. A Set lets stop()/mute kill all of them at once.
  type AlertNode = { ctx: AudioContext; osc: OscillatorNode; gain: GainNode };
  const activeAlertsRef = React.useRef<Set<AlertNode>>(new Set());
  // Monotonic token: bumped on every stop AND every play start. An in-flight
  // (async) play compares its captured token after `await ctx.resume()`; if it
  // no longer matches, a stop/newer play happened and it aborts.
  const alertTokenRef = React.useRef(0);

  // Pure teardown: silence + stop + disconnect ALL active alert oscillators.
  const teardownActiveAlert = useCallback(() => {
    const nodes = activeAlertsRef.current;
    if (nodes.size === 0) return;
    nodes.forEach((node) => {
      const now = node.ctx.currentTime;
      try {
        node.gain.gain.cancelScheduledValues(now);
      } catch {
        /* ignore */
      }
      try {
        // Fast ramp down to avoid clicks.
        node.gain.gain.setValueAtTime(Math.max(node.gain.gain.value, 0.0001), now);
        node.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);
      } catch {
        /* ignore */
      }
      try {
        node.osc.stop(now + 0.04);
      } catch {
        /* ignore */
      }
      try {
        node.osc.disconnect();
        node.gain.disconnect();
      } catch {
        /* ignore */
      }
    });
    nodes.clear();
  }, []);

  const stopNotificationSound = useCallback(() => {
    // Invalidate any in-flight play that is still awaiting ctx.resume().
    alertTokenRef.current++;
    teardownActiveAlert();
  }, [teardownActiveAlert]);

  // Play alert sound (used by live booking intent banner).
  const playNotificationSound = useCallback(async () => {
    // Claim this playback. If a stop (mute/dismiss) or a newer play happens while
    // we await ctx.resume() below, the token changes and we abort before starting.
    const myToken = ++alertTokenRef.current;
    try {
      const Ac = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ac) return;
      if (audioContextRef.current?.state === 'closed') {
        audioContextRef.current = null;
      }
      if (!audioContextRef.current) {
        audioContextRef.current = new Ac();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      if (ctx.state !== 'running') {
        toast.info('Click anywhere on this page once to enable sound', { duration: 5000 });
        return;
      }
      // Aborted while awaiting resume (e.g. user hit Mute/Done) — do not start.
      if (myToken !== alertTokenRef.current) return;
      // If a previous alert is still playing, stop it first (no token bump).
      teardownActiveAlert();
      const t = ctx.currentTime;
      // Short attention beep (was 20s, which felt like it "wouldn't stop").
      const durationSec = 4;
      const beepDuration = 0.5;
      const gap = 0.25;
      const cycleSec = beepDuration + gap;
      const beepCount = Math.max(1, Math.ceil((durationSec + gap) / cycleSec));
      const endsAt = t + durationSec;

      // Most efficient: single oscillator, scheduled gain envelope for beeps.
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 800;
      osc.type = 'sine';

      // Default silence.
      gain.gain.setValueAtTime(0.0001, t);

      for (let i = 0; i < beepCount; i++) {
        const start = t + i * cycleSec;
        if (start >= endsAt) break;
        const end = Math.min(start + beepDuration, endsAt);

        // Match old per-beep envelope: 0.25 -> 0.01 exponential by beep end.
        gain.gain.setValueAtTime(0.25, start);
        gain.gain.exponentialRampToValueAtTime(0.01, end);

        // Ensure the gap is silent (otherwise tail can bleed into next beep).
        const after = Math.min(end + 0.001, endsAt);
        gain.gain.setValueAtTime(0.0001, after);
      }

      // Safety: ensure we end silent.
      gain.gain.setValueAtTime(0.0001, endsAt);

      const entry: AlertNode = { ctx, osc, gain };
      activeAlertsRef.current.add(entry);
      // Self-remove from the active set once it finishes naturally, so the Set
      // never grows unbounded and stop() only iterates what's truly playing.
      osc.onended = () => {
        activeAlertsRef.current.delete(entry);
      };

      osc.start(t);
      osc.stop(endsAt + 0.05);
    } catch (e) {
      console.warn('Notification sound failed:', e);
    }
  }, [teardownActiveAlert]);

  // Completed job sound: restore the older short multi-beep pattern.
  const playCompletedJobSound = useCallback(async () => {
    try {
      const Ac = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ac) return;
      if (audioContextRef.current?.state === 'closed') {
        audioContextRef.current = null;
      }
      if (!audioContextRef.current) {
        audioContextRef.current = new Ac();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      if (ctx.state !== 'running') {
        toast.info('Click anywhere on this page once to enable sound', { duration: 5000 });
        return;
      }

      const t = ctx.currentTime;
      const beepDuration = 0.25;
      const gap = 0.25;

      for (let i = 0; i < 5; i++) {
        const start = t + i * (beepDuration + gap);
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 800;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.25, start);
        gain.gain.exponentialRampToValueAtTime(0.01, start + beepDuration);
        osc.start(start);
        osc.stop(start + beepDuration);
      }
    } catch (e) {
      console.warn('Completed job sound failed:', e);
    }
  }, []);



  // Single channel: new job INSERT (when polling enabled) + COMPLETED UPDATE (completion sound)
  useEffect(() => {
    if (isInitialLoad) return;

    const seedCompletedIds = async () => {
      try {
        const { data: rows, error } = await supabase
          .from('jobs')
          .select('id')
          .eq('status', 'COMPLETED')
          .order('created_at', { ascending: false })
          .limit(15);
        if (!error && rows?.length) {
          rows.forEach((j: { id: string }) => jobIdsCompletedByAdminRef.current.add(j.id));
        }
      } catch {
        // ignore
      }
    };
    const seedTimeout = setTimeout(seedCompletedIds, 2000);

    let channel = supabase.channel('admin-jobs-realtime');
    if (isPollingEnabled) {
      channel = channel.on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'jobs' },
        (payload: { new: Record<string, unknown> }) => {
          const row = payload.new as { id: string; status?: string };
          if (row.id) setLastCheckedJobId(row.id);
          const status = (row.status || 'PENDING') as string;
          if (['PENDING', 'ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS'].includes(status)) {
            setJobCounts((prev) => ({ ...prev, ongoing: (prev.ongoing || 0) + 1 }));
          }
          loadFilteredJobs(statusFilter, 1);
        }
      );
    }
    channel
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'jobs',
          filter: 'status=eq.COMPLETED',
        },
        (payload: { new: Record<string, unknown> }) => {
          const row = payload.new as {
            id: string;
            customer_id?: string | null;
            completed_at?: string | null;
            end_time?: string | null;
          };
          // Flip the returning-customer map immediately so the blue indicator turns on
          // without waiting for a manual refresh of the admin dashboard.
          if (row.customer_id) {
            setCustomerPriorServiceStatus((prev) =>
              prev[row.customer_id as string] ? prev : { ...prev, [row.customer_id as string]: true }
            );
          }
          if (jobIdsCompletedByAdminRef.current.has(row.id)) return;
          const completedAt = row.completed_at || row.end_time;
          if (completedAt) {
            const t = new Date(completedAt).getTime();
            if (Date.now() - t > 60000) return;
          }
          jobIdsCompletedByAdminRef.current.add(row.id);
          playCompletedJobSound();
          void loadJobCounts();
          if (statusFilter === 'COMPLETED') {
            void loadFilteredJobs('COMPLETED', currentPage, { silent: true });
          } else {
            // Warm page-1 cache so opening Completed after the sound is instant.
            void loadFilteredJobs('COMPLETED', 1, { silent: true, cacheOnly: true });
            if (statusFilter === 'ONGOING') {
              void loadFilteredJobs('ONGOING', 1, { silent: true });
            }
          }
        }
      )
      .subscribe((status) => {
        const prev = adminRealtimeStatusRef.current;
        adminRealtimeStatusRef.current = status;
        if (status === 'SUBSCRIBED' && prev != null && prev !== 'SUBSCRIBED') {
          void resumeAdminSyncRef.current({ invalidateTabCaches: false });
        }
      });

    return () => {
      clearTimeout(seedTimeout);
      supabase.removeChannel(channel);
    };
  }, [isInitialLoad, isPollingEnabled, statusFilter, currentPage, loadFilteredJobs, loadJobCounts, playCompletedJobSound]);

  const handleDeleteCustomer = async () => {
    if (!customerToDelete) return;
    if (isManager) {
      toast.error(managerRestrictedTitle);
      return;
    }

    try {
      const { error, data } = await db.customers.delete(customerToDelete.id);
      
      if (error) {
        console.error('Delete customer error details:', {
          error,
          customerId: customerToDelete.id,
          customer_id: customerToDelete.customer_id || customerToDelete.customerId,
          errorCode: error.code,
          errorMessage: error.message,
          errorDetails: error.details,
          errorHint: error.hint
        });
        throw new Error(error.message || 'Failed to delete customer. Check RLS policies.');
      }
      
      // Verify deletion succeeded
      if (data === null || data === undefined) {
        // Check if customer still exists
        const { data: verifyData } = await db.customers.getById(customerToDelete.id);
        if (verifyData) {
          throw new Error('Customer deletion failed - customer still exists. Check RLS policies.');
        }
      }
      
      toast.success(`Customer ${customerToDelete.customer_id || customerToDelete.customerId} deleted successfully`);
      
      // Remove from local state
      setCustomers(customers.filter(c => c.id !== customerToDelete.id));
      
      // Also remove jobs for this customer from local state
      // (Database should cascade delete, but we'll also clean up local state)
      setJobs(prevJobs => prevJobs.filter(job => {
        const jobCustomerId = (job as any).customer_id || job.customerId;
        return jobCustomerId !== customerToDelete.id;
      }));
      
      // Clear customer jobs cache
      setCustomerJobs(prev => {
        const updated = { ...prev };
        delete updated[customerToDelete.id];
        return updated;
      });
      
      setDeleteDialogOpen(false);
      setCustomerToDelete(null);
      
      // Reload dashboard data to ensure consistency
      await loadDashboardData();
      
      // Also reload filtered jobs if we're viewing a filtered view
      // This ensures jobs for deleted customers are removed from the view
      if (statusFilter === 'COMPLETED' || statusFilter === 'CANCELLED') {
        await loadFilteredJobs(statusFilter, currentPage);
      }
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

  /** Ongoing/ALL job lists use a slim customer embed; fetch full row when an action needs address/location/notes. */
  const loadFullCustomerForAction = useCallback(async (customer: Customer): Promise<Customer> => {
    try {
      const { data, error } = await db.customers.getById(customer.id);
      if (error || !data) return customer;
      return transformCustomerData(data);
    } catch {
      return customer;
    }
  }, []);

  /** Document modals — slim fetch (no photos/notes); skip network when list row already has address. */
  const loadCustomerForDocuments = useCallback(async (customer: Customer): Promise<Customer> => {
    const normalized = normalizeCustomerAddress(customer.address, {
      visible_address: customer.address?.visible_address || (customer as { visible_address?: string }).visible_address,
      formattedAddress: customer.location?.formattedAddress,
    });
    const hasAddress = Boolean(
      normalized.street ||
        normalized.area ||
        normalized.city ||
        normalized.state ||
        normalized.pincode ||
        customer.location?.formattedAddress?.trim()
    );

    if (customer.fullName && customer.phone && hasAddress) {
      return {
        ...customer,
        address: {
          ...normalized,
          visible_address:
            normalized.visible_address ||
            customer.address?.visible_address ||
            (customer as { visible_address?: string }).visible_address ||
            '',
        },
      };
    }

    try {
      const { data, error } = await db.customers.getByIdForDocuments(customer.id);
      if (error || !data) return customer;
      return transformCustomerData(data);
    } catch {
      return customer;
    }
  }, []);

  const handleOpenCustomerReport = useCallback((customer: Customer) => {
    setSelectedCustomerForReport(customer);
    openAdminModal('report', { customerId: customer.id });
  }, [openAdminModal]);

  const handleNavigateToCompletedJobFromReport = useCallback((customer: Customer, job: Job) => {
    const dateStr = jobCompletionLocalDateIso(job as Record<string, unknown>);
    if (!dateStr) {
      toast.error('This job has no completion date');
      return;
    }

    setCustomerReportDialogOpen(false);
    closeAdminModal();
    setSearchQuery('');
    setSearchTerm('');
    setSearchResults(null);
    setCompletedDatePreset('day');
    setCompletedDateFilter(dateStr);
    setCompletedRangeStartDate(dateStr);
    setCompletedRangeEndDate(dateStr);
    setCompletedLeadTypeFilter('all');
    setCompletedServiceSubTypeFilter('all');
    setCompletedByFilter('all');
    setCurrentPage(1);
    setStatusFilter('COMPLETED');
    navigate(
      adminDashboardLocation(
        buildAdminDashboardSearch({ clearModal: true, tab: null }, location.search)
      ),
      { replace: true }
    );
    setHighlightCompletedJobId(job.id);

    requestAnimationFrame(() => {
      document.querySelector('[data-admin-customer-list]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [navigate, location.search, closeAdminModal]);

  useEffect(() => {
    if (!highlightCompletedJobId || statusFilter !== 'COMPLETED') return;
    const hasJob = jobs.some((j) => j.id === highlightCompletedJobId);
    if (!hasJob) return;

    const timer = window.setTimeout(() => {
      const el = document.querySelector(`[data-completed-job-id="${highlightCompletedJobId}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 350);

    const clearTimer = window.setTimeout(() => setHighlightCompletedJobId(null), 5000);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(clearTimer);
    };
  }, [highlightCompletedJobId, jobs, statusFilter]);

  const handleEditCustomer = useCallback((customer: Customer) => {
    setEditingCustomer(customer);
    openAdminModal('edit-customer', { customerId: customer.id });
  }, [openAdminModal]);

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
        patchCustomerContactOnJobs(editingCustomer.id, {
          email: transformedCustomer.email ?? null,
          phone: transformedCustomer.phone ?? null,
          alternate_phone:
            (transformedCustomer as any).alternate_phone ??
            transformedCustomer.alternatePhone ??
            null,
          full_name:
            (transformedCustomer as any).full_name ?? transformedCustomer.fullName ?? null,
        });
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
      const token = await resolveSupabaseAccessTokenForApi();
      if (!token) {
        toast.error('Please sign in again to geocode addresses.');
        return;
      }

      const response = await fetch(`/.netlify/functions/geocode`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
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

  /** Lat/lng for job destination (customer location preferred). Works on slim or full job rows. */
  const resolveJobDestinationCoords = (jobRow: Job | any): { lat: number; lng: number } | null =>
    resolveJobDestinationCoordsSync(jobRow);

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

  const haversineDistanceMeters = (a: { lat: number; lng: number }, b: { lat: number; lng: number }): number => {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const R = 6371000; // meters
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const s1 = Math.sin(dLat / 2);
    const s2 = Math.sin(dLng / 2);
    const h = s1 * s1 + Math.cos(lat1) * Math.cos(lat2) * s2 * s2;
    const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
    return R * c;
  };

  const formatDistanceKm = (meters: number): string => {
    if (!Number.isFinite(meters) || meters <= 0) return '';
    const km = meters / 1000;
    if (km < 1) return `${km.toFixed(2)} km`;
    if (km < 10) return `${km.toFixed(2)} km`;
    return `${km.toFixed(1)} km`;
  };

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
              // Mobile-safe fallback: show approximate straight-line distance when Maps route fails (API blocked, quota, referrer, etc.)
              try {
                const approxMeters = haversineDistanceMeters(originCoords, destCoords);
                const approxText = formatDistanceKm(approxMeters);
                if (approxText) {
                  setCustomerDistances(prev => ({
                    ...prev,
                    [customerId]: {
                      distance: approxText,
                      duration: '',
                      isCalculating: false,
                    }
                  }));
                  toast.warning('Showing approximate distance (route unavailable)');
                  return;
                }
              } catch {
                // ignore
              }
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
      // Mobile-safe fallback: approximate straight-line distance when Maps fails to load/call.
      try {
        const approxMeters = haversineDistanceMeters(origin, destination);
        const approxText = formatDistanceKm(approxMeters);
        if (approxText) {
          setCustomerDistances(prev => ({
            ...prev,
            [customerId]: {
              distance: approxText,
              duration: '',
              isCalculating: false,
            }
          }));
          toast.warning('Showing approximate distance (route unavailable)');
          return;
        }
      } catch {
        // ignore
      }
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
      if (window.google && window.google.maps && window.google.maps.Geocoder) {
        return new Promise((resolve) => {
          const geocoder = new window.google.maps.Geocoder();
          geocoder.geocode(
            { location: { lat, lng } },
            (results, status) => {
              if (status === window.google.maps.GeocoderStatus.OK && results && results[0]) {
                resolve(results[0].formatted_address);
              } else {
                resolve(null);
              }
            }
          );
        });
      }
      return null;
    } catch (error) {
      console.error('Reverse geocoding error:', error);
      return null;
    }
  };

  // Function to fetch address from Google Maps location link
  const fetchAddressFromGoogleLocation = async () => {
    const googleLocation =
      extractMapsUrlFromText(editFormData?.google_location || '') ||
      sanitizeGoogleMapsInput(editFormData?.google_location || '');

    if (!googleLocation) {
      toast.error('Please enter a Google Maps link first');
      return;
    }

    if (!isGoogleMapsUrl(googleLocation)) {
      toast.error('Please enter a valid Google Maps link');
      return;
    }

    try {
      let loadingToast: string | number | undefined;
      if (isGoogleMapsShortLink(googleLocation)) {
        loadingToast = toast.loading('Resolving short link...');
      }

      const token = await resolveSupabaseAccessTokenForApi();
      const resolved = await resolveGoogleMapsInputToCoords(googleLocation, {
        shareText: editFormData?.google_location || '',
        addressHint: editFormData?.address?.street || '',
        accessToken: token,
      });

      if (loadingToast !== undefined) {
        toast.dismiss(loadingToast);
      }

      if (!resolved.ok) {
        toast.error(resolved.error, { duration: 8000 });
        return;
      }

      const { coords, didExpandShortLink, placeHintUsed, resolvedLocation } = resolved;
      if (didExpandShortLink) {
        setEditFormData((prev) => ({ ...prev, google_location: resolvedLocation }));
        toast.info('Short link expanded');
      }
      if (placeHintUsed) {
        toast.info(`Found location from place name: ${placeHintUsed}`);
      }

      loadingToast = toast.loading('Fetching address from Google Maps...');

      const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
      if (apiKey && (!window.google || !window.google.maps || !window.google.maps.Geocoder)) {
        await loadGoogleMapsGeocoderScript();
      }

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
    // Only update the google_location field - do NOT extract coordinates or geocode automatically
    setEditFormData(prev => ({
      ...prev,
      google_location: value
    }));

    if (!value.trim()) {
      // Clear location data when link is removed
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
        // No API key, skip loading Google Maps script
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

    if (isGettingLocation) return;

    setIsGettingLocation(true);
    void getDeviceLocation()
      .then((location) => {
        setCurrentLocation({ lat: location.lat, lng: location.lng });
        toast.success('Location captured!');
      })
      .catch((error) => {
        if (isGeolocationPositionError(error)) {
          toast.error(geolocationFailureMessage(error));
        } else {
          toast.error(error instanceof Error ? error.message : 'Failed to get your location');
        }
      })
      .finally(() => {
        setIsGettingLocation(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customers, isGettingLocation]);

  const confirmDelete = (customer: Customer) => {
    if (isManager) {
      toast.error(managerRestrictedTitle);
      return;
    }
    setCustomerToDelete(customer);
    setDeleteDialogOpen(true);
  };

  const handleAddCustomer = () => {
    openAdminModal('add-customer');
  };

  // Check if a customer with this phone or email already exists – single query, no need to load all customers.
  const checkExistingCustomer = async (phone: string, email?: string): Promise<Customer | null> => {
    const formattedPhone = phone ? formatPhoneNumber(phone) : '';
    if (formattedPhone) {
      const { data: byPhone } = await db.customers.getByPhone(formattedPhone);
      if (byPhone) return transformCustomerData(byPhone);
      const { data: byAlt } = await supabase
        .from('customers')
        .select(CUSTOMER_ROW_COLUMNS)
        .eq('alternate_phone', formattedPhone)
        .maybeSingle();
      if (byAlt) return transformCustomerData(byAlt);
    }
    if (email && email.trim()) {
      const { data: byEmail } = await supabase
        .from('customers')
        .select(CUSTOMER_ROW_COLUMNS)
        .ilike('email', email.trim())
        .maybeSingle();
      if (byEmail) return transformCustomerData(byEmail);
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
          toast.error('Please select a scheduled date', TOAST_VALIDATION);
          return;
        }
        
        if (!step5JobData.lead_source || step5JobData.lead_source.trim() === '') {
          toast.error('Please select a lead source', TOAST_VALIDATION);
          return;
        }
        
        if (step5JobData.lead_source === 'Other' && (!step5JobData.lead_source_custom || step5JobData.lead_source_custom.trim() === '')) {
          toast.error('Please enter a custom lead source', TOAST_VALIDATION);
          return;
        }

        if (step5JobData.service_sub_type === 'Custom' && (!step5JobData.service_sub_type_custom || step5JobData.service_sub_type_custom.trim() === '')) {
          toast.error('Please enter a custom service sub type', TOAST_VALIDATION);
          return;
        }

        if (step5JobData.scheduled_time_slot === 'CUSTOM' && (!step5JobData.scheduled_time_custom || step5JobData.scheduled_time_custom.trim() === '')) {
          toast.error('Please choose a visit time (list or exact time)', TOAST_VALIDATION);
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
        let { data: newCustomer, error } = await db.customers.create(customerData);
        // Idle JWT refreshes / brief network blips can drop the INSERT response while the row
        // still landed in Postgres. Treat a matching phone created in the last 90s as success.
        if (error || !newCustomer) {
          const fallbackPhone = customerData.phone;
          if (fallbackPhone) {
            try {
              await new Promise((resolve) => setTimeout(resolve, 600));
              const lookup = await db.customers.getByPhone(fallbackPhone);
              const candidate = lookup?.data as { id?: string; created_at?: string } | null;
              const createdAt = candidate?.created_at ? new Date(candidate.created_at).getTime() : 0;
              if (candidate?.id && createdAt && Date.now() - createdAt < 90_000) {
                console.warn(
                  '[AdminDashboard] customer create returned error but row exists; treating as success',
                  { phone: fallbackPhone, error: error?.message }
                );
                newCustomer = candidate as any;
                error = null;
              }
            } catch (lookupErr) {
              console.warn('[AdminDashboard] phone-based fallback lookup failed', lookupErr);
            }
          }
        }
        if (error || !newCustomer) {
          throw new Error(error?.message || 'Customer create returned no data');
        }
        result = newCustomer;
        toast.success(`Customer ${newCustomer.customer_id || newCustomer.customerId} created successfully!`);
      }

      await loadDashboardData();
      if (result) {
        setCustomers((prev) => {
          const transformed = transformCustomerData(result);
          const idx = prev.findIndex((c) => c.id === result.id);
          if (idx >= 0) return prev.map((c, i) => (i === idx ? transformed : c));
          return [...prev, transformed];
        });
      }

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
        service_sub_type: 'Service',
        service_sub_type_custom: '',
        scheduled_date: '',
        scheduled_time_slot: 'MORNING' as 'MORNING' | 'AFTERNOON' | 'EVENING' | 'CUSTOM',
        scheduled_time_custom: '',
        description: '',
        lead_source: 'Direct call',
        lead_source_custom: '',
        priority: 'MEDIUM' as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
      });

      closeAdminModal();
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
  const handleNewJob = useCallback((customer: Customer) => {
    setSelectedCustomerForJob(customer);
    setIsJobDialogReady(true);
    openAdminModal('new-job', { customerId: customer.id });
  }, [openAdminModal]);

  const handleCreateJob = async () => {
    if (!selectedCustomerForJob) return;

    // Validate required fields
    if (!newJobFormData.scheduled_date) {
      toast.error('Please select a scheduled date', TOAST_VALIDATION);
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

      if (newJobFormData.assigned_technician_id) {
        broadcastTechnicianJobListRefresh([newJobFormData.assigned_technician_id]);
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
    closeAdminModal();
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
    openAdminModal('customer-photos', { customerId: customer.id });
  };

  const handleClosePhotoGallery = () => {
    setCustomerPhotoGalleryOpen(false);
    closeAdminModal();
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
      
      const { data: jobs, error } = await db.jobs.getByCustomerIdForPhotoAggregation(customer.id);
      
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

      // Customer-level photos (saved without a job)
      const customerPhotosList = Array.isArray((customer as any).photos) ? (customer as any).photos : [];
      extractPhotoUrls(customerPhotosList).forEach(url => photoSet.add(url));
      
      if (jobs && jobs.length > 0) {
        console.log(`Loading photos from ${jobs.length} job(s) for customer ${customerId}`);
        
        // Sort jobs by date (newest first) so photos from newer jobs are added first
        const sortedJobs = [...jobs].sort((a, b) => {
          const aDate = new Date((a as any).completed_at || (a as any).end_time || (a as any).created_at || a.createdAt || 0).getTime();
          const bDate = new Date((b as any).completed_at || (b as any).end_time || (b as any).created_at || b.createdAt || 0).getTime();
          return bDate - aDate; // Newest first
        });
        
        sortedJobs.forEach((job, index) => {
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
                  // Do NOT add selected_qr_code_url — QR codes are references, not job photos
                  if (req.qr_photos && typeof req.qr_photos === 'object') {
                    if (req.qr_photos.payment_screenshot) {
                      const screenshotUrls = extractPhotoUrls([req.qr_photos.payment_screenshot]);
                      screenshotUrls.forEach(url => photoSet.add(url));
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
                // Do NOT add selected_qr_code_url — QR codes are references, not job photos
                if (requirements.qr_photos && typeof requirements.qr_photos === 'object') {
                  if (requirements.qr_photos.payment_screenshot) {
                    const screenshotUrls = extractPhotoUrls([requirements.qr_photos.payment_screenshot]);
                    screenshotUrls.forEach(url => photoSet.add(url));
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
      
      // Convert Set to Array and reverse to show latest photos first
      // Note: Since we're using a Set, order isn't guaranteed, but reversing helps
      const uniquePhotos = Array.from(photoSet).reverse();
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
    
    // Create thumbnails immediately for preview (use stable id per file index for correct lookup in loop)
    const thumbnailMap: {[key: string]: {url: string, uploading: boolean}} = {};
    const fileArray = Array.from(files);
    const uploadTimestamp = Date.now();

    fileArray.forEach((file, index) => {
      if (!validateImageFile(file).valid) return;
      // Create thumbnail URL
      const thumbnailUrl = URL.createObjectURL(file);
      const thumbnailId = `uploading-${uploadTimestamp}-${index}`;
      thumbnailMap[thumbnailId] = { url: thumbnailUrl, uploading: true };
    });
    
    // Set thumbnails immediately
    setUploadingThumbnails(prev => ({ ...prev, ...thumbnailMap }));
    
    try {
      const uploadedPhotos: string[] = [];
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const validation = validateImageFile(file);
        if (!validation.valid) {
          toast.error(validation.error ?? `File ${file.name} is not valid`);
          continue;
        }

        const thumbnailId = thumbnailMap[`uploading-${uploadTimestamp}-${i}`] ? `uploading-${uploadTimestamp}-${i}` : undefined;
        
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

          const { data: latestJob, error: jobsError } = await db.jobs.getLatestJobForCustomerPhotoUpload(
            customer.id
          );
          if (jobsError) {
            throw new Error('Failed to fetch customer jobs');
          }

          if (latestJob) {
            // Update the latest job with new photos (gallery only - use Edit Completed Job to add completion/bill photos)
            const currentPhotos = Array.isArray(latestJob.before_photos || latestJob.beforePhotos) ? (latestJob.before_photos || latestJob.beforePhotos) : [];
            const updatedPhotos = [...currentPhotos, ...uploadedPhotos];

            const { error: updateError } = await db.jobs.update(latestJob.id, {
              before_photos: updatedPhotos
            });

            if (updateError) {
              console.error('Failed to update job with photos:', updateError);
              toast.warning(`Photos uploaded but failed to save to database: ${updateError.message || 'Unknown error'}`);
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
            // No jobs — save as customer photos (normal photos not tied to a job)
            const existingPhotos = Array.isArray((customer as any).photos) ? (customer as any).photos : [];
            const combined = [...existingPhotos, ...uploadedPhotos];
            const { error: updateError } = await db.customers.update(customer.id, { photos: combined } as any);
            if (updateError) {
              console.error('Failed to save customer photos:', updateError);
              toast.warning(`Photos uploaded but couldn't save to customer: ${updateError.message || 'Unknown error'}. Run add-customer-photos.sql in Supabase if you added the column.`);
            } else {
              toast.success(`${uploadedPhotos.length} photo(s) uploaded and saved to customer.`);
              await loadCustomerPhotos(customerId);
              setTimeout(() => {
                setCustomerPhotos(prev => ({
                  ...prev,
                  [customerId]: [...new Set([...uploadedPhotos, ...(prev[customerId] || [])])]
                }));
              }, 500);
            }
          }
        } catch (error) {
          console.error('Error saving photos to database:', error);
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          toast.warning(`Photos uploaded but failed to save to database: ${errorMessage}`);
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
      // iOS and mobile PWA: Use file input fallback for better reliability
      if (shouldUseFileInputFallback()) {
        console.log('Using file input fallback for mobile/PWA');
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.capture = 'environment';
        input.onchange = (e) => {
          const files = (e.target as HTMLInputElement).files;
          if (files && files.length > 0) {
            handlePhotoUpload(files);
          }
        };
        setTimeout(() => {
          input.click();
        }, 100);
        return;
      }

      // Check if getUserMedia is available (with fallback for older browsers)
      const getUserMedia = navigator.mediaDevices?.getUserMedia || 
                          (navigator as any).getUserMedia || 
                          (navigator as any).webkitGetUserMedia || 
                          (navigator as any).mozGetUserMedia;
      
      if (!getUserMedia) {
        // Fallback to file input with capture attribute
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.capture = 'environment';
        input.onchange = (e) => {
          const files = (e.target as HTMLInputElement).files;
          if (files && files.length > 0) {
            handlePhotoUpload(files);
          }
        };
        setTimeout(() => {
          input.click();
        }, 100);
        return;
      }

      // Don't check permission first - just try getUserMedia
      // Permission API is unreliable, especially on mobile

      // Request camera access with proper error handling
      const stream = await requestCameraAccess();
      if (!stream) {
        throw new Error('Failed to access camera');
      }

      // Create optimized video element for iOS/mobile
      const video = createVideoElement();
      video.srcObject = stream;

      // Create a dialog/modal for camera preview
      const cameraDialog = document.createElement('div');
      cameraDialog.style.position = 'fixed';
      cameraDialog.style.top = '0';
      cameraDialog.style.left = '0';
      cameraDialog.style.width = '100%';
      cameraDialog.style.height = '100%';
      cameraDialog.style.backgroundColor = 'rgba(0, 0, 0, 0.95)';
      cameraDialog.style.zIndex = '9999';
      cameraDialog.style.display = 'flex';
      cameraDialog.style.flexDirection = 'column';
      cameraDialog.style.alignItems = 'center';
      cameraDialog.style.justifyContent = 'center';
      cameraDialog.style.gap = '20px';
      cameraDialog.style.padding = '20px';

      const videoContainer = document.createElement('div');
      videoContainer.style.width = '100%';
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
      captureButton.style.transition = 'opacity 0.2s';

      const cancelButton = document.createElement('button');
      cancelButton.textContent = 'Cancel';
      cancelButton.style.padding = '12px 24px';
      cancelButton.style.backgroundColor = '#6b7280';
      cancelButton.style.color = 'white';
      cancelButton.style.border = 'none';
      cancelButton.style.borderRadius = '8px';
      cancelButton.style.cursor = 'pointer';
      cancelButton.style.fontSize = '16px';

      let streamActive = true;
      const closeCamera = () => {
        if (!streamActive) return;
        streamActive = false;
        
        // Stop all tracks
        try {
          stream.getTracks().forEach(track => {
            track.stop();
          });
        } catch (e) {
          console.warn('Error stopping stream tracks:', e);
        }
        
        // Clear video srcObject
        try {
          if (video.srcObject) {
            video.srcObject = null;
          }
        } catch (e) {
          console.warn('Error clearing video srcObject:', e);
        }
        
        // Remove modal
        try {
          if (cameraDialog.parentNode) {
            document.body.removeChild(cameraDialog);
          }
        } catch (e) {
          console.warn('Error removing modal:', e);
        }
      };

      // Wait for video to be ready before allowing capture
      // iOS needs more time to initialize
      let videoReady = false;
      let readyCheckTimeout: NodeJS.Timeout | null = null;
      
      const enableCapture = () => {
        if (!streamActive) return;
        
        if (video.videoWidth > 0 && video.videoHeight > 0) {
          videoReady = true;
          captureButton.disabled = false;
          captureButton.style.opacity = '1';
          if (readyCheckTimeout) {
            clearTimeout(readyCheckTimeout);
            readyCheckTimeout = null;
          }
        }
      };
      
      // Multiple event listeners for better compatibility
      video.onloadedmetadata = enableCapture;
      video.onloadeddata = enableCapture;
      video.oncanplay = enableCapture;
      video.onplaying = enableCapture;
      
      // Also check after delays (iOS sometimes needs this)
      readyCheckTimeout = setTimeout(() => {
        if (!videoReady && streamActive) {
          enableCapture();
        }
      }, 500);
      
      setTimeout(() => {
        if (!videoReady && streamActive && video.videoWidth > 0 && video.videoHeight > 0) {
          enableCapture();
        }
      }, 1000);
      
      captureButton.disabled = true; // Disable until video is ready
      captureButton.style.opacity = '0.5';
      
      captureButton.onclick = () => {
        if (!streamActive) return;
        
        try {
          // Check if video is ready
          if (!video.videoWidth || !video.videoHeight || !videoReady) {
            toast.error('Camera not ready. Please wait a moment and try again.');
            return;
          }
          
          // Disable button during capture to prevent double-clicks
          captureButton.disabled = true;
          captureButton.style.opacity = '0.5';
          
          // Create canvas to capture the photo
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d', { willReadFrequently: false });
          
          if (!ctx) {
            toast.error('Failed to capture photo. Please try again.');
            captureButton.disabled = false;
            captureButton.style.opacity = '1';
            return;
          }
          
          try {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          } catch (drawError) {
            console.error('Error drawing video to canvas:', drawError);
            toast.error('Failed to capture photo. Please try again.');
            captureButton.disabled = false;
            captureButton.style.opacity = '1';
            return;
          }
          
          canvas.toBlob((blob) => {
            if (!streamActive) return;
            
            if (!blob) {
              toast.error('Failed to process photo. Please try again.');
              captureButton.disabled = false;
              captureButton.style.opacity = '1';
              return;
            }
            
            try {
              // Convert blob to File
              const file = new File([blob], `camera-photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
              // Create a DataTransfer object to get a proper FileList
              const dataTransfer = new DataTransfer();
              dataTransfer.items.add(file);
              
              // Clean up camera before processing file
              closeCamera();
              
              // Process the file
              handlePhotoUpload(dataTransfer.files);
            } catch (fileError) {
              console.error('Error creating file:', fileError);
              toast.error('Failed to process photo. Please try again.');
              captureButton.disabled = false;
              captureButton.style.opacity = '1';
              closeCamera();
            }
          }, 'image/jpeg', 0.9);
        } catch (error: any) {
          console.error('Error capturing photo:', error);
          toast.error(`Failed to capture photo: ${error?.message || 'Unknown error'}`);
          captureButton.disabled = false;
          captureButton.style.opacity = '1';
          closeCamera();
        }
      };

      cancelButton.onclick = closeCamera;

      buttonContainer.appendChild(captureButton);
      buttonContainer.appendChild(cancelButton);
      cameraDialog.appendChild(videoContainer);
      cameraDialog.appendChild(buttonContainer);
      document.body.appendChild(cameraDialog);
      
      // Stop stream and remove modal when clicking outside
      cameraDialog.onclick = (e) => {
        if (e.target === cameraDialog) {
          closeCamera();
        }
      };
      
      // Cleanup on page unload
      const unloadHandler = () => closeCamera();
      window.addEventListener('beforeunload', unloadHandler);
      cameraDialog.addEventListener('remove', () => {
        window.removeEventListener('beforeunload', unloadHandler);
      });

    } catch (error: any) {
      console.error('Error accessing camera:', error);
      
      // Provide more specific error messages but always fallback
      if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError') {
        toast.error('Camera permission denied. Using file picker instead.');
      } else if (error?.name === 'NotFoundError' || error?.name === 'DevicesNotFoundError') {
        console.log('No camera found, using file input instead');
      } else {
        console.log('Camera access failed, using file input instead');
      }
      
      // Always fallback to file input with capture attribute
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.capture = 'environment';
      input.onchange = (e) => {
        const files = (e.target as HTMLInputElement).files;
        if (files && files.length > 0) {
          handlePhotoUpload(files);
        }
      };
      setTimeout(() => {
        input.click();
      }, 100);
    }
  };

  // History management functions
  const handleViewHistory = (customer: Customer) => {
    setSelectedCustomerForHistory(customer);
    setHistoryHasMore(false);
    setHistoryLoadingMore(false);
    openAdminModal('history', { customerId: customer.id });
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

  const nextStep = async () => {
    if (!validateStep(currentStep)) return;
    if (currentStep === 1) {
      const existing = await checkExistingCustomer(addFormData.phone, addFormData.email);
      if (existing) {
        setExistingCustomer(existing);
        setOverrideDialogOpen(true);
        return;
      }
    }
    setCurrentStep(prev => Math.min(prev + 1, 5));
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

  const adminSearchSyncedRef = useRef<string | null>(null);

  const runCustomerSearch = useCallback(async (rawQuery: string, opts?: { skipNavigate?: boolean }): Promise<Customer[]> => {
    const trimmedQuery = rawQuery.trim();
    hapticTap();
    setIsSearching(true);
    setSearchTerm(trimmedQuery);
    setSearchQuery(trimmedQuery);

    if (!opts?.skipNavigate) {
      const currentSearch = new URLSearchParams(location.search).get('search');
      if (trimmedQuery) {
        adminSearchSyncedRef.current = trimmedQuery;
        navigate(
          adminDashboardLocation(
            buildAdminDashboardSearch({ search: trimmedQuery }, location.search)
          ),
          { replace: currentSearch === trimmedQuery }
        );
      } else {
        adminSearchSyncedRef.current = null;
        navigate(
          adminDashboardLocation(
            buildAdminDashboardSearch({ clearSearch: true }, location.search)
          ),
          { replace: true }
        );
      }
    }

    if (trimmedQuery) {
      const runJobSearch = shouldRunAdminJobNumberSearch(trimmedQuery);
      const [{ data, error }, jobSearchResult] = await Promise.all([
        db.customers.searchSlim(trimmedQuery, 50, { includeAddressAndLocation: true }),
        runJobSearch
          ? db.jobs.searchByJobNumberForAdmin(trimmedQuery, 25)
          : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
      ]);
      const jobHits = jobSearchResult.data;
      const jobSearchError = jobSearchResult.error;

      if (error || jobSearchError) {
        toast.error('Search failed');
        setSearchResults([]);
        setIsSearching(false);
        return [];
      } else {
        const customerMap = new Map<string, Record<string, unknown>>();
        for (const row of data || []) {
          customerMap.set(String((row as { id: string }).id), row as Record<string, unknown>);
        }

        for (const job of jobHits || []) {
          const embedded = (job as { customer?: Record<string, unknown> }).customer;
          const customerId = String(
            (job as { customer_id?: string }).customer_id || embedded?.id || ''
          );
          if (customerId && !customerMap.has(customerId) && embedded?.id) {
            customerMap.set(customerId, embedded);
          }
        }

        const missingIds = [
          ...new Set(
            (jobHits || [])
              .map((job) => String((job as { customer_id?: string }).customer_id || ''))
              .filter((id) => id && !customerMap.has(id))
          ),
        ];
        if (missingIds.length) {
          await Promise.all(
            missingIds.map(async (id) => {
              const { data: cust } = await db.customers.getById(id);
              if (cust) customerMap.set(id, cust as Record<string, unknown>);
            })
          );
        }

        const results = Array.from(customerMap.values()).map((row) => transformCustomerData(row));
        setSearchResults(results);

        if (jobHits?.length) {
          setJobs((prev) => {
            const byId = new Map(prev.map((j) => [j.id, j]));
            for (const hit of jobHits) {
              const id = String((hit as { id: string }).id);
              byId.set(id, { ...byId.get(id), ...hit });
            }
            return Array.from(byId.values());
          });
        }
        setIsSearching(false);
        return results;
      }
    } else {
      setSearchResults(null);
    }
    setIsSearching(false);
    return [];
  }, [location.search, navigate]);

  const handleSearch = useCallback(async () => {
    await runCustomerSearch(searchQuery);
  }, [runCustomerSearch, searchQuery]);

  const handleSearchFromBookingIntent = useCallback((phone: string) => {
    const query = normalizePhoneForSearch(phone) || phone.trim();
    if (!query) return;
    void runCustomerSearch(query);
    requestAnimationFrame(() => {
      document.querySelector('[data-admin-search]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [runCustomerSearch]);

  const handleClearSearch = () => {
    hapticTap();
    adminSearchSyncedRef.current = null;
    if (new URLSearchParams(location.search).get('search')) {
      navigate(
        adminDashboardLocation(
          buildAdminDashboardSearch({ clearSearch: true }, location.search)
        ),
        { replace: true }
      );
      return;
    }
    setSearchQuery('');
    setSearchTerm('');
    setSearchResults(null);
  };

  // Customer search (?search=) — swipe-back clears results instead of exiting the PWA.
  useEffect(() => {
    if (!location.pathname.startsWith('/admin')) return;

    const parsed = parseAdminDashboardUrl(location.search);
    const viewParam = parsed.view;

    if (
      isAdminOverlayViewParam(viewParam) ||
      isAdminTabViewParam(viewParam) ||
      isAdminToolParam(parsed.tool) ||
      parsed.modal
    ) {
      return;
    }

    const searchParam = parsed.search?.trim() ?? '';

    if (searchParam) {
      if (adminSearchSyncedRef.current === searchParam) {
        return;
      }
      adminSearchSyncedRef.current = searchParam;
      void (async () => {
        const results = await runCustomerSearch(searchParam, { skipNavigate: true });
        if (parsed.searchAction === 'photos' && results.length > 0) {
          const match =
            results.find(
              (c) =>
                String(c.phone || '').replace(/\D/g, '') === searchParam.replace(/\D/g, '')
            ) ?? results[0];
          setSelectedCustomerForPhotos(match);
          openAdminModal('customer-photos', { customerId: match.id });
          navigate(
            adminDashboardLocation(
              buildAdminDashboardSearch({ searchAction: null }, location.search)
            ),
            { replace: true }
          );
        }
      })();
      return;
    }

    adminSearchSyncedRef.current = null;
    if (searchTerm.trim()) {
      setSearchQuery('');
      setSearchTerm('');
      setSearchResults(null);
    }
  }, [location.pathname, location.search, navigate, openAdminModal, runCustomerSearch, searchTerm]);

  const handleSearchKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  // When user pastes a phone from contacts (e.g. 063616 1253, +91 636161253), normalize and format
  const handleSearchPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text');
    const normalized = normalizePhoneForSearch(pasted);
    if (normalized.length >= 10) {
      e.preventDefault();
      void runCustomerSearch(normalized);
    }
  };

  const handlePhoneClick = (customer: Customer) => {
    setSelectedCustomerPhone(customer);
    setPhonePopupOpen(true);
  };

  const patchCustomerPhonesInState = useCallback((updated: Customer) => {
    const alt = (updated as any).alternate_phone ?? updated.alternatePhone ?? '';
    setCustomers((prev) =>
      prev.map((c) =>
        c.id === updated.id
          ? { ...c, phone: updated.phone, alternate_phone: alt, alternatePhone: alt }
          : c
      )
    );
    setJobs((prev) =>
      prev.map((job) => {
        const cust = (job as any).customer;
        if (!cust || cust.id !== updated.id) return job;
        return {
          ...job,
          customer: {
            ...cust,
            phone: updated.phone,
            alternate_phone: alt,
            alternatePhone: alt,
          },
        };
      })
    );
    setSelectedCustomerPhone((prev) =>
      prev?.id === updated.id ? { ...prev, phone: updated.phone, alternatePhone: alt, alternate_phone: alt } : prev
    );
    setSelectedCustomerWhatsApp((prev) =>
      prev?.id === updated.id ? { ...prev, phone: updated.phone, alternatePhone: alt, alternate_phone: alt } : prev
    );
  }, []);

  const handleWhatsAppClick = (customer: Customer) => {
    const phone = customer?.phone || '';
    if (!phone.trim()) {
      toast.error('Phone number not available');
      return;
    }
    setWhatsappComposerCustomerId(customer.id);
    setWhatsappComposerTemplate('general');
    setWhatsappComposerOpen(true);
  };

  const openCompletionEmailComposer = (job: Job, brand: DocumentBrand) => {
    const customer = (job as any).customer || job.customer;
    const email = getValidCustomerEmail(customer?.email);
    if (!email) {
      toast.error('This customer has no email on file');
      return;
    }
    setEmailComposerForcedBrand(brand);
    setEmailComposerJobId(job.id);
    setEmailComposerCustomerId(null);
    setEmailComposerTemplate('job_completion');
    setEmailComposerContext('completed_job');
    setEmailComposerOpen(true);
  };

  const sendCompletionEmailQuick = async (job: Job, brand: DocumentBrand): Promise<boolean> => {
    const result = await sendJobCompletionEmail({ jobId: job.id, brand });
    if (result.ok) {
      toast.success(
        result.to
          ? `Completion email sent to ${result.to}`
          : 'Completion email sent'
      );
      await handleMailSent(job.id);
      return true;
    }
    toast.error(result.error || 'Could not send email');
    return false;
  };

  const handleGenerateBill = useCallback((customer: Customer) => {
    setSelectedCustomerForBill(customer);
    openAdminModal('bill', { customerId: customer.id });
  }, [openAdminModal]);

  const handleBillModalClose = () => {
    setBillModalOpen(false);
    closeAdminModal();
    setSelectedCustomerForBill(null);
  };

  const handleGenerateQuotation = (customer: Customer) => {
    setSelectedCustomerForQuotation(customer);
    setQuotationModalOpen(true);
    void loadCustomerForDocuments(customer).then(setSelectedCustomerForQuotation);
  };

  const handleQuotationModalClose = () => {
    setQuotationModalOpen(false);
    setSelectedCustomerForQuotation(null);
  };

  const handleGenerateAMC = (customer: Customer) => {
    setSelectedCustomerForAMC(customer);
    setAmcModalOpen(true);
    void loadCustomerForDocuments(customer).then(setSelectedCustomerForAMC);
  };

  const handleViewAMCInfo = async (customer: Customer) => {
    setSelectedCustomerForAMC(customer);
    setAmcInfoDialogOpen(true);
    setLoadingAMCInfo(true);
    
    try {
      const { data, error } = await db.amcContracts.getActiveByCustomerId(customer.id);
      if (!error && data) {
        setAmcInfo(data);
      } else {
        setAmcInfo(null);
      }
    } catch (error) {
      console.error('Error loading AMC info:', error);
      setAmcInfo(null);
    } finally {
      setLoadingAMCInfo(false);
    }
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

  const reloadCustomerPriorServiceStatus = async () => {
    try {
      const map = await fetchCustomerIdsWithCompletedJobsMap();
      setCustomerPriorServiceStatus(map);
    } catch (error) {
      console.error('Error reloading prior-service status:', error);
    }
  };

  const handleManualRefresh = useCallback(async () => {
    hapticTap();
    await invalidateAdminDashboardCaches();
    jobsListCacheRef.current.clear();
    clearModuleJobsListCache();
    setLoadedCompletedJobDetails({});
    setModuleDashboardSessionReady(true);
    try {
      const sessionReady = await ensureAdminSupabaseSession();
      if (!sessionReady) {
        toast.error('Could not refresh — session not ready. Please try again.');
        return;
      }
      await reloadCustomerPriorServiceStatus();
      const [techniciansResult] = await Promise.all([
        db.technicians.getAllForDashboard(100),
        loadJobCounts(),
        loadFilteredJobs(statusFilter, currentPage),
      ]);
      if (techniciansResult.data) {
        const transformed = techniciansResult.data.map(transformTechnicianData);
        techniciansRef.current = transformed;
        setTechnicians(transformed);
      } else if (techniciansResult.error) {
        console.error('Failed to refresh technicians:', techniciansResult.error);
      }
      void loadDashboardSecondary();
    } catch (error) {
      toast.error(
        `Failed to refresh data: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }, [statusFilter, currentPage, loadJobCounts, loadFilteredJobs, loadDashboardSecondary]);

  const handleGenerateTaxInvoice = (customer: Customer) => {
    setSelectedCustomerForTaxInvoice(customer);
    setTaxInvoiceModalOpen(true);
    void loadCustomerForDocuments(customer).then(setSelectedCustomerForTaxInvoice);
  };

  const handleTaxInvoiceModalClose = () => {
    setTaxInvoiceModalOpen(false);
    setSelectedCustomerForTaxInvoice(null);
  };

  const handleShowGSTInvoices = () => {
    navigate(
      adminDashboardLocation(
        buildAdminDashboardSearch({ view: 'gst-invoices', clearModal: true }, location.search)
      )
    );
  };

  const handleHideGSTInvoices = () => {
    navigate(
      adminDashboardLocation(
        buildAdminDashboardSearch({ view: null, clearView: true }, location.search)
      ),
      { replace: true }
    );
  };

  const handleShowAMCView = () => {
    setToolsMenuOpen(false);
    navigate(
      adminDashboardLocation(
        buildAdminDashboardSearch({ view: 'amc-view', clearModal: true }, location.search)
      )
    );
  };

  const handleHideAMCView = () => {
    navigate(
      adminDashboardLocation(
        buildAdminDashboardSearch({ view: null, clearView: true }, location.search)
      ),
      { replace: true }
    );
    reloadAMCStatus(); // Refresh green dots when returning to dashboard
    reloadCustomerPriorServiceStatus();
  };



  // Job assignment functions
  const handleAssignJob = (job: Job) => {
    setSelectedTechnicianId('');
    openAdminModal('assign', { jobId: job.id });
  };

  const handleSaveJobAssignment = async () => {
    if (!jobToAssign || !selectedTechnicianId) return;

    // Save scroll position so we can restore after refresh (page stays where user was)
    const scrollY = window.scrollY;

    try {
      // Follow-up flow: pick technician first, then ask date/time (move to ongoing), then auto-assign.
      if (followUpAssignFlow) {
        setFollowUpAssignFlow(false);
        setFollowUpAssignTechnicianId(selectedTechnicianId);
        setAssignJobDialogOpen(false);
        setAssignAfterMoveToOngoing(true);
        handleMoveToOngoing(jobToAssign);
        return;
      }

      const { error } = await db.jobs.update(jobToAssign.id, {
        assigned_technician_id: selectedTechnicianId,
        status: 'ASSIGNED',
        assigned_date: new Date().toISOString()
      } as any);

      if (error) throw error;

      broadcastTechnicianJobListRefresh([selectedTechnicianId]);

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
      } else {
        toast.success(`Job assigned to ${assignedTechnician?.fullName || 'technician'} for ${(jobToAssign.customer as any)?.full_name || (jobToAssign.customer as any)?.fullName || 'customer'}`);
      }

      setAssignJobDialogOpen(false);

      // Show WhatsApp dialog
      if (assignedTechnician && assignedTechnician.phone) {
        scrollPositionBeforeWhatsAppRef.current = scrollY;
        const serviceSubType = (jobToAssign as any).service_sub_type || jobToAssign.serviceSubType || 'Service';
        let customerForWhatsApp = (jobToAssign.customer as any) || {};
        const customerId = customerForWhatsApp?.id || (jobToAssign as any).customer_id;
        if (customerId) {
          const { data: freshCustomer } = await db.customers.getById(String(customerId));
          if (freshCustomer) customerForWhatsApp = freshCustomer;
        }
        const customerName = customerForWhatsApp?.full_name || customerForWhatsApp?.fullName || 'Customer';
        const addr = customerForWhatsApp?.address || (jobToAssign as any).service_address;
        const vis = customerForWhatsApp?.visible_address;
        const locationText = (vis && String(vis).trim()) ? String(vis).trim() : (addr?.area || addr?.city || '');
        const leadSource = getLeadSourceFromJob(jobToAssign as Record<string, unknown>);
        const customTime = getJobCustomTimeLabel(jobToAssign as Record<string, unknown>) || '';
        setWhatsappTechnician({
          name: assignedTechnician.fullName,
          phone: assignedTechnician.phone
        });
        setWhatsappServiceSubType(serviceSubType);
        setWhatsappCustomerName(customerName);
        setWhatsappLocation(locationText || '');
        setWhatsappLeadSource(leadSource);
        setWhatsappCustomTime(customTime);
        setWhatsappDialogOpen(true);
        openAdminWhatsappModal();
      } else {
        closeAdminModal();
      }
      
      setJobToAssign(null);
      setSelectedTechnicianId('');

      // Defer refetch so dialog close/layout flush first; silent load avoids global spinner.
      queueMicrotask(() => {
        void loadFilteredJobs(statusFilter, currentPage, { silent: true }).finally(() => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              window.scrollTo(0, scrollY);
            });
          });
        });
      });
    } catch (error) {
      toast.error('Failed to assign job');
      setFollowUpAssignFlow(false);
      setFollowUpAssignTechnicianId('');
    }
  };

  const handleAddTeam = async (job: Job) => {
    setJobForTeam(job);
    setSelectedTeamMemberId('');
    setAddTeamDialogOpen(true);

    // Reload technicians to get latest data
    await reloadTechnicians();
  };

  const handleSaveTeamMember = async () => {
    if (!jobForTeam || !selectedTeamMemberId) return;

    try {
      // Get current team_members from job
      const currentTeamMembers = (jobForTeam as any).team_members || [];
      const teamMembersArray = Array.isArray(currentTeamMembers) ? currentTeamMembers : [];
      
      // Check if technician is already in team
      if (teamMembersArray.includes(selectedTeamMemberId)) {
        toast.error('This technician is already in the team');
        return;
      }

      // Check if technician is the primary assigned technician
      if ((jobForTeam as any).assigned_technician_id === selectedTeamMemberId) {
        toast.error('This technician is already the primary assigned technician');
        return;
      }

      // Add new team member
      const updatedTeamMembers = [...teamMembersArray, selectedTeamMemberId];

      const { error } = await db.jobs.update(jobForTeam.id, {
        team_members: updatedTeamMembers
      } as any);

      if (error) throw error;

      broadcastTechnicianJobListRefresh([selectedTeamMemberId]);

      // Send notification to team member
      const teamMember = technicians.find(t => t.id === selectedTeamMemberId);
      if (teamMember) {
        const notification = createJobAssignedNotification(
          (jobForTeam as any).job_number || jobForTeam.jobNumber || 'Job',
          (jobForTeam.customer as any)?.full_name || (jobForTeam.customer as any)?.fullName || 'Customer',
          teamMember.fullName,
          jobForTeam.id,
          teamMember.id
        );
        await sendNotification(notification);
      }

      toast.success('Team member added successfully');
      setAddTeamDialogOpen(false);
      setJobForTeam(null);
      setSelectedTeamMemberId('');

      await loadFilteredJobs(statusFilter, currentPage, { silent: true });
    } catch (error: any) {
      console.error('Error adding team member:', error);
      toast.error(error.message || 'Failed to add team member');
    }
  };

  const handleRemoveTeam = async (job: Job) => {
    setJobForRemoveTeam(job);
    setSelectedTeamMemberToRemove('');
    setRemoveTeamDialogOpen(true);

    // Reload technicians to get latest data
    await reloadTechnicians();
  };

  const handleSaveTeamMemberRemoval = async () => {
    if (!jobForRemoveTeam || !selectedTeamMemberToRemove) return;

    try {
      // Get current team_members from job
      const currentTeamMembers = (jobForRemoveTeam as any).team_members || [];
      const teamMembersArray = Array.isArray(currentTeamMembers) ? currentTeamMembers : [];
      
      // Remove the selected team member
      const updatedTeamMembers = teamMembersArray.filter((id: string) => id !== selectedTeamMemberToRemove);

      const { error } = await db.jobs.update(jobForRemoveTeam.id, {
        team_members: updatedTeamMembers
      } as any);

      if (error) throw error;

      broadcastTechnicianJobListRefresh([selectedTeamMemberToRemove]);

      toast.success('Team member removed successfully');
      setRemoveTeamDialogOpen(false);
      setJobForRemoveTeam(null);
      setSelectedTeamMemberToRemove('');

      await loadFilteredJobs(statusFilter, currentPage, { silent: true });
    } catch (error: any) {
      console.error('Error removing team member:', error);
      toast.error(error.message || 'Failed to remove team member');
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
  const handleReassignJob = (job: Job) => {
    const technicianId =
      (job as any).assigned_technician_id ||
      job.assignedTechnicianId ||
      (job as any).assignedTechnician?.id ||
      '';
    setSelectedTechnicianForReassign(technicianId);
    openAdminModal('reassign', { jobId: job.id });
  };

  const handleReassignSubmit = async () => {
    if (!jobToReassign || !selectedTechnicianForReassign) return;

    // Save scroll position so we can restore after refresh (page stays where user was)
    const scrollY = window.scrollY;

    try {
      const { error } = await db.jobs.update(jobToReassign.id, {
        assigned_technician_id: selectedTechnicianForReassign
      });

      if (error) {
        console.error('Reassign job error:', error);
        toast.error(`Failed to reassign job: ${error.message || 'Unknown error'}`);
        return;
      }

      const previousTechnicianId =
        (jobToReassign as any).assigned_technician_id || jobToReassign.assignedTechnicianId;
      broadcastTechnicianJobListRefresh([
        previousTechnicianId,
        selectedTechnicianForReassign,
      ]);

      // Update local state
      setJobs(prev => prev.map(job => 
        job.id === jobToReassign.id 
          ? { ...job, assigned_technician_id: selectedTechnicianForReassign }
          : job
      ));

      toast.success('Job reassigned successfully');
      setReassignDialogOpen(false);

      // Show WhatsApp dialog
      const reassignedTechnician = technicians.find(t => t.id === selectedTechnicianForReassign);
      if (reassignedTechnician && reassignedTechnician.phone) {
        scrollPositionBeforeWhatsAppRef.current = scrollY;
        const serviceSubType = (jobToReassign as any).service_sub_type || jobToReassign.serviceSubType || 'Service';
        let customerForWhatsApp = (jobToReassign.customer as any) || {};
        const customerId = customerForWhatsApp?.id || (jobToReassign as any).customer_id;
        if (customerId) {
          const { data: freshCustomer } = await db.customers.getById(String(customerId));
          if (freshCustomer) customerForWhatsApp = freshCustomer;
        }
        const customerName = customerForWhatsApp?.full_name || customerForWhatsApp?.fullName || 'Customer';
        const addr = customerForWhatsApp?.address || (jobToReassign as any).service_address;
        const vis = customerForWhatsApp?.visible_address;
        const locationText = (vis && String(vis).trim()) ? String(vis).trim() : (addr?.area || addr?.city || '');
        const leadSource = getLeadSourceFromJob(jobToReassign as Record<string, unknown>);
        const customTime = getJobCustomTimeLabel(jobToReassign as Record<string, unknown>) || '';
        setWhatsappTechnician({
          name: reassignedTechnician.fullName,
          phone: reassignedTechnician.phone
        });
        setWhatsappServiceSubType(serviceSubType);
        setWhatsappCustomerName(customerName);
        setWhatsappLocation(locationText || '');
        setWhatsappLeadSource(leadSource);
        setWhatsappCustomTime(customTime);
        setWhatsappDialogOpen(true);
        openAdminWhatsappModal();
      } else {
        closeAdminModal();
      }
      
      setJobToReassign(null);
      setSelectedTechnicianForReassign('');

      queueMicrotask(() => {
        void loadFilteredJobs(statusFilter, currentPage, { silent: true }).finally(() => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              window.scrollTo(0, scrollY);
            });
          });
        });
      });
    } catch (error: any) {
      console.error('Reassign job exception:', error);
      toast.error(`Failed to reassign job: ${error?.message || 'Unknown error'}`);
    }
  };

  const handleUnassignJob = async (job: Job) => {
    try {
      const previousTechnicianId =
        (job as any).assigned_technician_id || job.assignedTechnicianId;
      const teamMemberIds = Array.isArray((job as any).team_members)
        ? ((job as any).team_members as string[])
        : [];

      const { error } = await db.jobs.update(job.id, {
        assigned_technician_id: null,
        assigned_date: null,
        status: 'PENDING'
      });

      if (error) {
        toast.error('Failed to unassign job');
        return;
      }

      broadcastTechnicianJobListRefresh([previousTechnicianId, ...teamMemberIds]);

      // Update local state
      setJobs(prev => prev.map(j => 
        j.id === job.id 
          ? { 
              ...j, 
              assigned_technician_id: null,
              assignedTechnicianId: null,
              assigned_date: null,
              assignedDate: null,
              status: 'PENDING' as const
            }
          : j
      ));

      // Update customer jobs state
      setCustomerJobs(prev => {
        const updated = { ...prev };
        Object.keys(updated).forEach(customerId => {
          updated[customerId] = updated[customerId].map(j => 
            j.id === job.id 
              ? { 
                  ...j, 
                  assigned_technician_id: null,
                  assignedTechnicianId: null,
                  assigned_date: null,
                  assignedDate: null,
                  status: 'PENDING' as any
                }
              : j
          );
        });
        return updated;
      });

      toast.success('Technician unassigned successfully. Job status set to PENDING.');
    } catch (error) {
      console.error('Error unassigning job:', error);
      toast.error('Failed to unassign job');
    }
  };

  const handleEditJob = (job: Job) => {
    openAdminModal('edit-job', { jobId: job.id });
  };

  // handleEditJobSubmit moved to EditJobDialog component

  // Helper function to format time in 12-hour format
  const formatTime12Hour = (date: Date | string): string => {
    const d = typeof date === 'string' ? new Date(date) : date;
    const hours = d.getHours();
    const minutes = d.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    const displayMinutes = minutes.toString().padStart(2, '0');
    return `${displayHours}:${displayMinutes} ${ampm}`;
  };

  const getJobScheduledDateKey = (jobRow: Job | any): string | null => {
    const raw = jobRow?.scheduled_date ?? jobRow?.scheduledDate;
    if (!raw) return null;
    if (typeof raw === 'string') return raw.split('T')[0];
    try {
      const d = new Date(raw);
      if (isNaN(d.getTime())) return null;
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    } catch {
      return null;
    }
  };

  const parseCustomTimeMinutesFromJob = (jobRow: Job | any): number | null => {
    let reqs = jobRow?.requirements;
    if (typeof reqs === 'string') {
      try {
        reqs = JSON.parse(reqs);
      } catch {
        return null;
      }
    }
    if (!Array.isArray(reqs)) return null;
    const withTime = reqs.find((r: any) => r && typeof r === 'object' && r.custom_time);
    const t = withTime?.custom_time;
    if (!t || typeof t !== 'string') return null;
    const parts = t.trim().split(':');
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1] || '0', 10);
    if (isNaN(h) || h < 0 || h > 23) return null;
    if (isNaN(m) || m < 0 || m > 59) return null;
    return h * 60 + m;
  };

  /** Visit order: CUSTOM with HH:MM first (by time), then MORNING→…→FLEXIBLE, then CUSTOM without time (by created). */
  const routeSortKeyForJob = (jobRow: Job | any): string => {
    const slot = String(jobRow?.scheduled_time_slot || jobRow?.scheduledTimeSlot || 'MORNING').toUpperCase();
    const created = new Date(jobRow?.created_at || jobRow?.createdAt || 0).getTime();
    if (slot === 'CUSTOM') {
      const mins = parseCustomTimeMinutesFromJob(jobRow);
      if (mins != null) return `A-${String(mins).padStart(5, '0')}-${String(created).padStart(13, '0')}`;
      return `C-${String(created).padStart(13, '0')}`;
    }
    const slotRank: Record<string, number> = {
      MORNING: 1,
      AFTERNOON: 2,
      EVENING: 3,
      FLEXIBLE: 4,
    };
    const r = slotRank[slot] ?? 50;
    return `B-${String(r).padStart(2, '0')}-${String(created).padStart(13, '0')}`;
  };

  /**
   * Location for route labels — from DB-shaped job row: `jobs.service_address` (jsonb),
   * embedded `customer.address`, `customer.visible_address`, and `service_location` when needed.
   * Normalizes all whitespace so multi-word areas (e.g. "HSR Layout") and odd spacing still show.
   */
  const getRouteLocationWord = (jobRow: Job | any): string => {
    const str = (v: unknown): string => {
      if (v == null) return '';
      if (typeof v === 'string') return v;
      if (typeof v === 'number' && !Number.isNaN(v)) return String(v);
      return '';
    };
    const normalizeWs = (s: string) =>
      str(s).replace(/[\s\u00a0\u2000-\u200B\uFEFF]+/g, ' ').trim();

    const genericToken = (w: string) => {
      const t = w.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!t || t.length < 2) return true;
      if (t === 'bengaluru' || t === 'bangalore' || t === 'banglore') return true;
      if (t === 'karnataka' || t === 'india') return true;
      return false;
    };

    /** Entire phrase is only generic tokens (e.g. "Bangalore" or "Bangalore Karnataka"). */
    const phraseIsOnlyGeneric = (s: string) => {
      const n = normalizeWs(s);
      if (!n) return true;
      const parts = n.split(/\s+/).filter(Boolean);
      return parts.length > 0 && parts.every((p) => genericToken(p));
    };

    /** Prefer full short phrase when it contains any non-generic word (multi-word areas). */
    const pickPhraseOrEmpty = (raw: string, maxLen = 48): string => {
      const n = normalizeWs(raw);
      if (!n) return '';
      if (phraseIsOnlyGeneric(n)) return '';
      return n.length > maxLen ? `${n.slice(0, Math.max(0, maxLen - 1))}…` : n;
    };

    const firstNonGenericWord = (s: string): string => {
      for (const raw of normalizeWs(s).split(/[\s,]+/)) {
        const w = raw.trim();
        if (!w) continue;
        if (!genericToken(w)) return w;
      }
      return '';
    };

    /** DB/Google often store "Frazer, Town, Bangalore" — must not use only the first comma segment. */
    const localityBeforeCity = (raw: string): string => {
      const parts = raw.split(',').map((p) => normalizeWs(p)).filter(Boolean);
      const kept: string[] = [];
      for (const p of parts) {
        const lower = p.toLowerCase();
        const first = lower.split(/\s+/)[0] || '';
        if (/^\d{6}$/.test(p)) break;
        if (
          first === 'bengaluru' ||
          first === 'bangalore' ||
          first === 'banglore' ||
          first === 'karnataka' ||
          first === 'india'
        ) {
          break;
        }
        if (lower === 'in') break;
        kept.push(p);
      }
      return normalizeWs(kept.join(' '));
    };

    const cust = jobRow?.customer as any;
    const customerAddress = cust?.address || {};
    const serviceAddress = jobRow?.service_address || jobRow?.serviceAddress || {};

    let visibleLocation =
      normalizeWs(
        str(customerAddress?.visible_address) ||
          str(customerAddress?.visibleAddress) ||
          str(cust?.visible_address) ||
          str(serviceAddress?.visible_address) ||
          str(serviceAddress?.visibleAddress)
      );

    if (visibleLocation.includes(',')) {
      visibleLocation = localityBeforeCity(visibleLocation);
    }

    if (!visibleLocation) {
      visibleLocation = normalizeWs(
        str(customerAddress?.area) || str(serviceAddress?.area)
      );
      if (visibleLocation.includes(',')) {
        visibleLocation = localityBeforeCity(visibleLocation);
      }
    }

    let phrase = pickPhraseOrEmpty(visibleLocation);
    if (phrase) return phrase;

    const landmark = normalizeWs(str(customerAddress?.landmark) || str(serviceAddress?.landmark));
    phrase = pickPhraseOrEmpty(landmark);
    if (phrase) return phrase;

    const street = normalizeWs(str(customerAddress?.street) || str(serviceAddress?.street));
    phrase = pickPhraseOrEmpty(street);
    if (phrase) return phrase;

    const city = normalizeWs(str(customerAddress?.city) || str(serviceAddress?.city));
    let w = firstNonGenericWord(city);
    if (w) return w;

    const pin = normalizeWs(str(customerAddress?.pincode) || str(serviceAddress?.pincode));
    if (pin) return pin;

    const svcLoc = cust?.location || jobRow?.service_location || jobRow?.serviceLocation || {};
    const formatted = normalizeWs(str(svcLoc?.formattedAddress) || str(svcLoc?.formatted_address));
    if (formatted) {
      const joined = localityBeforeCity(formatted);
      phrase = pickPhraseOrEmpty(joined);
      if (phrase) return phrase;
      for (const part of formatted.split(',')) {
        const chunk = pickPhraseOrEmpty(normalizeWs(part));
        if (chunk) return chunk;
        w = firstNonGenericWord(part);
        if (w) return w;
      }
    }

    return '';
  };

  /** Route row: `Customer name (location)` — distinct stops even when area text repeats. */
  const formatRouteStopLabel = (jobRow: Job | any): string => {
    const cust = jobRow?.customer as any;
    const displayName = (cust?.full_name || cust?.fullName || 'Customer').trim() || 'Customer';
    const loc = getRouteLocationWord(jobRow);
    if (loc) return `${displayName} (${loc})`;
    return `${displayName} (—)`;
  };

  const handleShareJobWhatsApp = async (job: Job) => {
    const assignedTechnicianId = (job as any).assigned_technician_id || job.assignedTechnicianId;
    if (!assignedTechnicianId) {
      toast.error('No technician assigned to this job');
      return;
    }
    const technician = technicians.find(t => t.id === assignedTechnicianId);
    if (!technician?.phone) {
      toast.error('Technician phone number not found');
      return;
    }

    const embeddedCustomer = ((job as any).customer || job.customer) as any;
    const customerId = embeddedCustomer?.id || (job as any).customer_id;
    let freshCustomer: any = null;
    if (customerId) {
      const { data, error } = await db.customers.getById(String(customerId));
      if (!error && data) {
        freshCustomer = data;
      }
    }

    const customer = freshCustomer || embeddedCustomer;
    const name = customer?.full_name || customer?.fullName || 'N/A';
    const phone = customer?.phone || 'N/A';
    const altPhone = customer?.alternate_phone || customer?.alternatePhone;
    const serviceType = (job as any).service_type || job.serviceType || 'N/A';
    const serviceSubType = (job as any).service_sub_type || job.serviceSubType || '';
    let requirements: any[] = (job as any).requirements;
    if (typeof requirements === 'string') {
      try {
        requirements = JSON.parse(requirements);
      } catch {
        requirements = [];
      }
    }
    if (requirements && !Array.isArray(requirements)) {
      requirements = requirements && typeof requirements === 'object' ? [requirements] : [];
    }
    const leadSource = findLeadSource(requirements || []) || 'N/A';
    const serviceLocation = customer?.location || (job as any).service_location || job.serviceLocation || {};
    const formattedAddress = serviceLocation?.formattedAddress || serviceLocation?.formatted_address || '';
    const googleMapLink = getLocationLinkFromObject(serviceLocation) ||
      (formattedAddress ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(formattedAddress)}` : '');
    const serviceAddress = customer?.address || (job as any).service_address || job.serviceAddress || {};
    const addressParts = [
      serviceAddress?.visible_address || serviceAddress?.visibleAddress,
      serviceAddress?.street,
      serviceAddress?.area,
      serviceAddress?.city,
      serviceAddress?.state,
      serviceAddress?.pincode,
      serviceAddress?.landmark ? `Landmark: ${serviceAddress.landmark}` : null,
    ].filter(Boolean);
    const fullAddressLine = addressParts.length > 0 ? addressParts.join(', ') : (formattedAddress || '');
    const lines = [
      `*Job: ${(job as any).job_number || job.jobNumber || job.id}*`,
      `Service: ${serviceType}${serviceSubType ? ` - ${serviceSubType}` : ''}`,
      `Name: ${name}`,
      `Phone: ${phone}`,
      ...(altPhone ? [`Alt. phone: ${altPhone}`] : []),
      `Lead source: ${leadSource}`,
      ...(googleMapLink ? [`Location: ${googleMapLink}`] : []),
      ...(fullAddressLine ? ['', '_Full address:_', fullAddressLine] : []),
    ];
    const text = lines.join('\n');
    const url = `https://wa.me/${formatPhoneForWhatsApp(technician.phone)}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    toast.success('Opening WhatsApp to share job details');
  };

  /** Active route jobs for this technician (assigned / en route / in progress), any scheduled day — not only today. */
  const collectOngoingJobsForMeasure = (workingJob: Job | any): Job[] => {
    const assignedTechnicianId =
      (workingJob as any).assigned_technician_id || workingJob.assignedTechnicianId || null;
    if (!assignedTechnicianId) return [workingJob as Job];
    const ROUTE_STATUSES = new Set(['ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS']);
    let routeJobs = jobs.filter((j) => {
      const tid = (j as any).assigned_technician_id || j.assignedTechnicianId;
      if (String(tid) !== String(assignedTechnicianId)) return false;
      const st = (j as any).status || j.status;
      return ROUTE_STATUSES.has(st);
    });
    if (!routeJobs.some((j) => j.id === workingJob.id)) {
      routeJobs = [...routeJobs, workingJob as Job];
    }
    return [...routeJobs].sort((a, b) => {
      const da = getJobScheduledDateKey(a) || '9999-12-31';
      const db = getJobScheduledDateKey(b) || '9999-12-31';
      if (da !== db) return da.localeCompare(db);
      return routeSortKeyForJob(a).localeCompare(routeSortKeyForJob(b));
    });
  };

  const resolveJobCoordsForMeasure = async (
    job: Job | any,
    onResolvingLink?: () => void
  ): Promise<{ lat: number; lng: number; workingRow: any } | null> =>
    resolveJobLatLngFromRow(job, {
      getJobByIdFull: db.jobs.getByIdFull,
      onResolvingLink,
    });

  const resolveCustomDistanceStops = async (): Promise<{
    origin: { lat: number; lng: number };
    dest: { lat: number; lng: number };
    fromLabel: string;
    toLabel: string;
  } | null> => {
    const workingJob = selectedJobForDistance;
    if (!workingJob || !customDistanceFromId || !customDistanceToId) {
      toast.error('Choose both From and To.');
      return null;
    }
    if (customDistanceFromId === customDistanceToId) {
      toast.error('From and To must be different.');
      return null;
    }

    const assignedTechnicianId =
      (workingJob as any).assigned_technician_id || workingJob.assignedTechnicianId || null;
    const assignedTechnician = technicians.find((t) => t.id === assignedTechnicianId);
    const techLocation =
      assignedTechnician?.currentLocation || (assignedTechnician as any)?.current_location;

    const ongoingJobsForRoute = collectOngoingJobsForMeasure(workingJob);
    const jobById = (id: string) =>
      ongoingJobsForRoute.find((j) => j.id === id) || jobs.find((j) => j.id === id);

    const labelForStop = (stopId: string): string => {
      if (stopId === '__tech__') {
        return assignedTechnician
          ? `${assignedTechnician.fullName} (last location)`
          : 'Technician';
      }
      const j = jobById(stopId);
      return j ? formatRouteStopLabel(j) : stopId;
    };

    let origin: { lat: number; lng: number } | null = null;
    let dest: { lat: number; lng: number } | null = null;

    if (customDistanceFromId === '__tech__') {
      if (!techLocation?.latitude || !techLocation?.longitude) {
        toast.error('Technician location not available.');
        return null;
      }
      origin = { lat: Number(techLocation.latitude), lng: Number(techLocation.longitude) };
    } else {
      const j = jobById(customDistanceFromId);
      if (!j) {
        toast.error('Could not find the From job.');
        return null;
      }
      const fromResolved = await resolveJobCoordsForMeasure(j);
      origin = fromResolved ? { lat: fromResolved.lat, lng: fromResolved.lng } : null;
    }

    if (customDistanceToId === '__tech__') {
      if (!techLocation?.latitude || !techLocation?.longitude) {
        toast.error('Technician location not available.');
        return null;
      }
      dest = { lat: Number(techLocation.latitude), lng: Number(techLocation.longitude) };
    } else {
      const j = jobById(customDistanceToId);
      if (!j) {
        toast.error('Could not find the To job.');
        return null;
      }
      const toResolved = await resolveJobCoordsForMeasure(j);
      dest = toResolved ? { lat: toResolved.lat, lng: toResolved.lng } : null;
    }

    if (!origin || !dest) {
      toast.error('Map coordinates missing for one of the stops. Check addresses or map links.');
      return null;
    }

    return {
      origin,
      dest,
      fromLabel: labelForStop(customDistanceFromId),
      toLabel: labelForStop(customDistanceToId),
    };
  };

  const calculateCustomDistanceBetweenStops = async () => {
    const stops = await resolveCustomDistanceStops();
    if (!stops) return;

    const { origin, dest, fromLabel, toLabel } = stops;

    setIsLoadingCustomDistance(true);
    setCustomDistanceResult(null);

    try {
      await ensureGoogleMapsLoaded();
      if (!(window as any).google?.maps?.DistanceMatrixService) {
        throw new Error('DistanceMatrixService not available');
      }

      const distanceMatrix = new (window as any).google.maps.DistanceMatrixService();

      distanceMatrix.getDistanceMatrix(
        {
          origins: [origin],
          destinations: [dest],
          travelMode: (window as any).google.maps.TravelMode.DRIVING,
          unitSystem: (window as any).google.maps.UnitSystem.METRIC,
        },
        (response: any, status: any) => {
          setIsLoadingCustomDistance(false);
          if (status === (window as any).google.maps.DistanceMatrixStatus.OK && response) {
            const el = response.rows[0]?.elements[0];
            if (el && el.status === (window as any).google.maps.DistanceMatrixElementStatus.OK) {
              const distanceValueM = el.distance?.value ?? 0;
              let distanceText = el.distance?.text || '';
              if (distanceValueM < 1000) {
                distanceText = `${(distanceValueM / 1000).toFixed(2)} km`;
              }
              const durationText = el.duration?.text || '';
              setCustomDistanceResult({
                fromLabel,
                toLabel,
                distance: distanceText,
                duration: durationText,
              });
              return;
            }
          }
          const m = haversineDistanceMeters(origin, dest);
          setCustomDistanceResult({
            fromLabel,
            toLabel,
            distance: formatDistanceKm(m) || '',
            duration: '',
            isApproximate: true,
          });
          toast.warning('Showing approximate distance (route unavailable)');
        }
      );
    } catch (error) {
      setIsLoadingCustomDistance(false);
      toast.error(
        `Failed to calculate: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  };

  const openCustomDistanceInGoogleMaps = async () => {
    setIsOpeningCustomDistanceMaps(true);
    try {
      const stops = await resolveCustomDistanceStops();
      if (!stops) return;
      openGoogleMapsDirectionsBetween(stops.origin, stops.dest, 'driving');
      toast.success('Opening route in Google Maps');
    } finally {
      setIsOpeningCustomDistanceMaps(false);
    }
  };

  const getMeasureStopSelectOptions = (): { value: string; label: string }[] => {
    const wj = selectedJobForDistance;
    if (!wj) return [];
    const tid = (wj as any).assigned_technician_id || wj.assignedTechnicianId;
    const tech = tid ? technicians.find((t) => t.id === tid) : null;
    const tl = tech?.currentLocation || (tech as any)?.current_location;
    const out: { value: string; label: string }[] = [];
    if (tech && tl?.latitude && tl?.longitude) {
      out.push({ value: '__tech__', label: `${tech.fullName} (last location)` });
    }
    for (const j of collectOngoingJobsForMeasure(wj)) {
      out.push({ value: j.id, label: formatRouteStopLabel(j) });
    }
    return out;
  };

  const handleMeasureDistance = async (job: Job) => {
    console.log('🔍 [AdminDashboard] handleMeasureDistance called for job:', {
      jobId: job.id,
      jobNumber: job.jobNumber || (job as any).job_number
    });

    let loadingToast: string | number | undefined;
    const resolved = await resolveJobCoordsForMeasure(job, () => {
      loadingToast = toast.loading('Resolving map link...');
    });
    if (loadingToast !== undefined) toast.dismiss(loadingToast);

    if (!resolved) {
      console.error('❌ [AdminDashboard] No coordinates available for distance measurement');
      toast.error(getLocationUnavailableMessage(job));
      return;
    }

    const workingJob = resolved.workingRow as Job;
    const jobCoords = { lat: resolved.lat, lng: resolved.lng };

    setSelectedJobForDistance(workingJob);
    setCustomDistanceResult(null);

    const assignedTechnicianId =
      (workingJob as any).assigned_technician_id || workingJob.assignedTechnicianId || null;

    if (!assignedTechnicianId) {
      toast.error('No technician assigned to this job.');
      return;
    }

    let assignedTechnician = technicians.find((t) => t.id === assignedTechnicianId);
    try {
      const { data: freshRow, error: freshErr } = await db.technicians.getById(assignedTechnicianId);
      if (!freshErr && freshRow) {
        const fresh = transformTechnicianData(freshRow);
        assignedTechnician = fresh;
        setTechnicians((prev) => {
          const idx = prev.findIndex((t) => t.id === assignedTechnicianId);
          if (idx === -1) return [...prev, fresh];
          const next = [...prev];
          next[idx] = fresh;
          return next;
        });
      }
    } catch (e) {
      console.warn('[AdminDashboard] getById for measure distance (refresh technician location) failed:', e);
    }

    if (!assignedTechnician) {
      toast.error('Assigned technician not found.');
      return;
    }

    const techLocation =
      assignedTechnician.currentLocation ||
      (assignedTechnician as any).current_location;
    const hasLocation = !!(techLocation && techLocation.latitude && techLocation.longitude);

    if (!hasLocation) {
      toast.error('Assigned technician does not have location data available.');
      return;
    }

    let lastUpdatedFormatted: string | undefined;
    if (techLocation?.lastUpdated) {
      try {
        lastUpdatedFormatted = formatTime12Hour(techLocation.lastUpdated);
      } catch (e) {
        console.warn('Failed to format lastUpdated time:', e);
      }
    }

    const initialDistances = [{
      technician: assignedTechnician,
      distance: '',
      duration: '',
      distanceValue: undefined,
      durationValue: undefined,
      estimatedArrival: undefined,
      lastUpdated: lastUpdatedFormatted,
      hasLocation: true,
      isCalculating: true,
      isAssigned: true
    }];

    setTechnicianDistances(initialDistances);

    const ongoingStops = collectOngoingJobsForMeasure(workingJob as Job);
    const fromId = '__tech__';
    let toId = workingJob.id;
    if (fromId === toId) {
      const alt = ongoingStops.find((j) => j.id !== fromId);
      if (alt) toId = alt.id;
    }
    setCustomDistanceFromId(fromId);
    setCustomDistanceToId(toId);

    setDistanceMeasurementDialogOpen(true);
    setIsCalculatingDistances(true);

    const origin = {
      lat: Number(techLocation!.latitude),
      lng: Number(techLocation!.longitude)
    };
    const destination = { lat: Number(jobCoords.lat), lng: Number(jobCoords.lng) };

    const applySingleLegResult = (
      distanceText: string,
      durationText: string,
      distanceValue: number,
      durationValue: number
    ) => {
      let estimatedArrival: string | undefined;
      if (techLocation?.lastUpdated && durationValue > 0 && distanceValue > 1000) {
        try {
          const lastUpdatedDate = new Date(techLocation.lastUpdated);
          estimatedArrival = formatTime12Hour(
            new Date(lastUpdatedDate.getTime() + durationValue * 1000)
          );
        } catch {
          estimatedArrival = undefined;
        }
      }
      setTechnicianDistances([{
        technician: assignedTechnician,
        distance: distanceText,
        duration: durationText,
        distanceValue,
        durationValue,
        estimatedArrival,
        lastUpdated: lastUpdatedFormatted,
        hasLocation: true,
        isCalculating: false,
        isAssigned: true
      }]);
    };

    try {
      await ensureGoogleMapsLoaded();

      if (!(window as any).google?.maps?.DistanceMatrixService) {
        throw new Error('DistanceMatrixService not available');
      }

      const distanceMatrix = new (window as any).google.maps.DistanceMatrixService();
      distanceMatrix.getDistanceMatrix(
        {
          origins: [origin],
          destinations: [destination],
          travelMode: (window as any).google.maps.TravelMode.DRIVING,
          unitSystem: (window as any).google.maps.UnitSystem.METRIC,
        },
        (response: any, status: any) => {
          setIsCalculatingDistances(false);

          if (status === (window as any).google.maps.DistanceMatrixStatus.OK && response) {
            const result = response.rows[0]?.elements[0];

            if (result && result.status === window.google.maps.DistanceMatrixElementStatus.OK) {
              const distanceValue = result.distance.value || 0;
              let distanceText = result.distance.text;
              if (distanceValue < 1000) {
                distanceText = `${(distanceValue / 1000).toFixed(2)} km`;
              }
              const durationText = result.duration?.text || '';
              const durationValue = result.duration?.value || 0;
              applySingleLegResult(distanceText, durationText, distanceValue, durationValue);
            } else if (result?.status === window.google.maps.DistanceMatrixElementStatus.ZERO_RESULTS) {
              const bicyclingMatrix = new (window as any).google.maps.DistanceMatrixService();
              bicyclingMatrix.getDistanceMatrix(
                {
                  origins: [origin],
                  destinations: [destination],
                  travelMode: (window as any).google.maps.TravelMode.BICYCLING,
                  unitSystem: (window as any).google.maps.UnitSystem.METRIC,
                },
                (bikeResponse: any, bikeStatus: any) => {
                  setIsCalculatingDistances(false);
                  if (bikeStatus === (window as any).google.maps.DistanceMatrixStatus.OK && bikeResponse) {
                    const bikeResult = bikeResponse.rows[0]?.elements[0];
                    if (bikeResult && bikeResult.status === window.google.maps.DistanceMatrixElementStatus.OK) {
                      const distanceValue = bikeResult.distance.value || 0;
                      let distanceText = bikeResult.distance.text;
                      if (distanceValue < 1000) {
                        distanceText = `${(distanceValue / 1000).toFixed(2)} km`;
                      }
                      const durationText = bikeResult.duration?.text || '';
                      const durationValue = bikeResult.duration?.value || 0;
                      applySingleLegResult(distanceText, durationText, distanceValue, distanceValue);
                    } else {
                      setTechnicianDistances([{
                        technician: assignedTechnician,
                        distance: '',
                        duration: '',
                        distanceValue: undefined,
                        durationValue: undefined,
                        estimatedArrival: undefined,
                        lastUpdated: lastUpdatedFormatted,
                        hasLocation: true,
                        isCalculating: false,
                        isAssigned: true
                      }]);
                    }
                  } else {
                    setTechnicianDistances([{
                      technician: assignedTechnician,
                      distance: '',
                      duration: '',
                      distanceValue: undefined,
                      durationValue: undefined,
                      estimatedArrival: undefined,
                      lastUpdated: lastUpdatedFormatted,
                      hasLocation: true,
                      isCalculating: false,
                      isAssigned: true
                    }]);
                  }
                }
              );
            } else {
              setTechnicianDistances([{
                technician: assignedTechnician,
                distance: '',
                duration: '',
                distanceValue: undefined,
                durationValue: undefined,
                estimatedArrival: undefined,
                lastUpdated: lastUpdatedFormatted,
                hasLocation: true,
                isCalculating: false,
                isAssigned: true
              }]);
            }
          } else {
            setIsCalculatingDistances(false);
            toast.error(`Distance calculation failed: ${status}`);
          }
        }
      );
    } catch (error) {
      console.error('Error calculating distances:', error);
      setIsCalculatingDistances(false);
      try {
        const techLoc: any = assignedTechnician.currentLocation || (assignedTechnician as any)?.current_location;
        if (techLoc?.latitude && techLoc?.longitude && jobCoords?.lat && jobCoords?.lng) {
          const approxMeters = haversineDistanceMeters(
            { lat: Number(techLoc.latitude), lng: Number(techLoc.longitude) },
            { lat: Number(jobCoords.lat), lng: Number(jobCoords.lng) }
          );
          const approxText = formatDistanceKm(approxMeters);
          if (approxText) {
            setTechnicianDistances([{
              technician: assignedTechnician,
              distance: approxText,
              duration: '',
              distanceValue: approxMeters,
              durationValue: undefined,
              estimatedArrival: undefined,
              lastUpdated: techLoc?.lastUpdated ? new Date(techLoc.lastUpdated).toLocaleString('en-IN') : '',
              hasLocation: true,
              isCalculating: false,
              isAssigned: true,
              isApproximate: true,
            } as any]);
            toast.warning('Showing approximate distance (route unavailable)');
            return;
          }
        }
      } catch {
        // ignore
      }
      toast.error(`Failed to calculate distances: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Get ETA for share-technician-info dialog (reuses same job coords and distance logic)
  const getEtaForShareDialog = useCallback(async (job: Job): Promise<{ durationText?: string; estimatedArrival?: string } | null> => {
    const resolved = await resolveJobCoordsForMeasure(job);
    if (!resolved) return null;

    const workingJob = resolved.workingRow;
    const jobCoords = { lat: resolved.lat, lng: resolved.lng };

    const assignedTechnicianId =
      workingJob.assigned_technician_id || workingJob.assignedTechnicianId;
    if (!assignedTechnicianId) return null;
    const assignedTechnician = technicians.find(t => t.id === assignedTechnicianId);
    const techLocation = assignedTechnician?.currentLocation || (assignedTechnician as any)?.current_location;
    if (!techLocation?.latitude || !techLocation?.longitude) return null;
    try {
      await ensureGoogleMapsLoaded();
      const distanceMatrix = new (window as any).google.maps.DistanceMatrixService();
      const origin = { lat: Number(techLocation.latitude), lng: Number(techLocation.longitude) };
      const destination = { lat: jobCoords.lat, lng: jobCoords.lng };
      return new Promise((resolve) => {
        distanceMatrix.getDistanceMatrix(
          {
            origins: [origin],
            destinations: [destination],
            travelMode: (window as any).google.maps.TravelMode.DRIVING,
            unitSystem: (window as any).google.maps.UnitSystem.METRIC,
          },
          (response: any, status: any) => {
            if (status !== (window as any).google.maps.DistanceMatrixStatus.OK || !response) {
              resolve(null);
              return;
            }
            const result = response.rows?.[0]?.elements?.[0];
            if (!result || result.status !== (window as any).google.maps.DistanceMatrixElementStatus.OK) {
              resolve(null);
              return;
            }
            const durationText = result.duration?.text || '';
            const durationValue = result.duration?.value ?? 0;
            let estimatedArrival: string | undefined;
            if (techLocation?.lastUpdated && durationValue > 0) {
              try {
                const lastUpdatedDate = new Date((techLocation as any).lastUpdated);
                const arrivalDate = new Date(lastUpdatedDate.getTime() + durationValue * 1000);
                estimatedArrival = formatTime12Hour(arrivalDate);
              } catch {
                estimatedArrival = undefined;
              }
            }
            resolve({ durationText, estimatedArrival: estimatedArrival || undefined });
          }
        );
      });
    } catch {
      return null;
    }
  }, [technicians, ensureGoogleMapsLoaded, formatTime12Hour]);

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
    openAdminModal('follow-up', { jobId: job.id });
  };

  // Handle follow-up submission
  const handleFollowUpSubmit = async (jobId: string, followUpData: {
    followUpDate: string;
    followUpReason: string;
    parentFollowUpId?: string;
    rescheduleFollowUpId?: string;
    autoMoveToOngoingOnDate?: boolean;
  }) => {
    try {
      // If rescheduling, check if the old follow-up is a root (no parent) before deleting
      let wasRootFollowUp = false;
      if (followUpData.rescheduleFollowUpId) {
        // Get the old follow-up to check if it's a root
        const { data: oldFollowUp } = await supabase
          .from('follow_ups')
          .select('parent_follow_up_id')
          .eq('id', followUpData.rescheduleFollowUpId)
          .single();
        
        wasRootFollowUp = !oldFollowUp?.parent_follow_up_id;
        
        const { error: deleteError } = await supabase
          .from('follow_ups')
          .delete()
          .eq('id', followUpData.rescheduleFollowUpId);

      if (deleteError) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Delete follow-up error details:', deleteError);
        }
        // Provide more helpful error message for 401 errors
        if (deleteError.code === 'PGRST301' || deleteError.message?.includes('401') || deleteError.message?.includes('unauthorized')) {
          throw new Error('Authentication failed. Please check your login status and try again.');
        }
        throw new Error(deleteError.message || 'Failed to delete follow-up record');
      }
      }

      // Create follow-up record in follow_ups table
      // Store null for admin scheduling so UI consistently renders "Admin" even if a technician session exists in another tab.
      const { data: followUpRecord, error: followUpError } = await supabase
        .from('follow_ups')
        .insert({
          job_id: jobId,
          parent_follow_up_id: followUpData.parentFollowUpId || null,
          follow_up_date: followUpData.followUpDate,
          reason: followUpData.followUpReason,
          notes: null,
          scheduled_by: null,
          completed: false
        } as any)
        .select()
        .single();

      if (followUpError) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Follow-up error details:', followUpError);
        }
        // Provide more helpful error message for 401 errors
        if (followUpError.code === 'PGRST301' || followUpError.message?.includes('401') || followUpError.message?.includes('unauthorized')) {
          throw new Error('Authentication failed. Please check your login status and try again.');
        }
        throw new Error(followUpError.message || 'Failed to create follow-up record');
      }

      // If this is a root follow-up (no parent) OR if we're rescheduling a root follow-up, update job status
      // Store null for admin scheduling so UI consistently renders "Admin" even if a technician session exists in another tab.
      if (!followUpData.parentFollowUpId || wasRootFollowUp) {
        const existingJob =
          jobs.find((j) => j.id === jobId) ||
          Object.values(customerJobs)
            .flat()
            .find((j) => j.id === jobId);
        const requirements = applyAutoMoveToOngoingOnDateFlag(
          (existingJob as any)?.requirements,
          Boolean(followUpData.autoMoveToOngoingOnDate)
        );

        const { error: jobError } = await db.jobs.update(jobId, {
          status: 'FOLLOW_UP',
          follow_up_date: followUpData.followUpDate,
          follow_up_notes: followUpData.followUpReason,
          follow_up_scheduled_by: null,
          follow_up_scheduled_at: new Date().toISOString(),
          requirements,
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
            followUpScheduledBy: 'admin',
            followUpScheduledAt: new Date().toISOString(),
            requirements,
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
                followUpScheduledBy: 'admin',
                followUpScheduledAt: new Date().toISOString(),
                requirements,
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
      
      // Reload follow-up jobs for glow (minimal: today/tomorrow only)
      db.jobs.getFollowUpForGlow().then(({ data }) => {
        if (data) setAllFollowUpJobs(data as Job[]);
      }).catch(() => {});
      
      // Reload filtered jobs if currently viewing follow-up jobs to show updated date
      if (statusFilter === 'RESCHEDULED') {
        loadFilteredJobs('RESCHEDULED', currentPage);
      }
    } catch (error: any) {
      const errorMessage = error?.message || 'Failed to schedule follow-up';
      if (process.env.NODE_ENV === 'development') {
        console.error('Follow-up submission error:', error);
      }
      toast.error(errorMessage);
    }
  };

  // Handle moving follow-up job to ongoing
  const handleMoveToOngoing = (job: Job) => {
    // Set default values to current date and time
    const now = new Date();
    const today = getTodayLocalDate();
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
    openAdminModal('move-ongoing', { jobId: job.id });
  };

  const handleAssignFromFollowUp = (job: Job) => {
    // Step 1: pick technician
    setFollowUpAssignFlow(true);
    handleAssignJob(job);
  };

  // Actually perform the move to ongoing action with date and time
  const performMoveToOngoing = async () => {
    if (!selectedJobForMoveToOngoing) return;

    if (!moveToOngoingDate) {
      toast.error('Please select a date', TOAST_VALIDATION);
      return;
    }

    if (moveToOngoingTimeSlot === 'CUSTOM' && !moveToOngoingCustomTime) {
      toast.error('Please choose a visit time (list or exact time)', TOAST_VALIDATION);
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
      
      const shouldAssign = assignAfterMoveToOngoing && !!followUpAssignTechnicianId;
      const updateData: any = {
        status: shouldAssign ? 'ASSIGNED' : 'PENDING',
        scheduled_date: moveToOngoingDate, // Already in YYYY-MM-DD format from date input
        scheduled_time_slot: timeSlotToUse,
        // Clear follow-up related fields when moving to ongoing
        follow_up_date: null,
        follow_up_time: null,
        follow_up_notes: null,
        follow_up_scheduled_by: null,
        follow_up_scheduled_at: null,
        // Assign immediately if coming from follow-up "Assign" flow, else clear for normal move-to-ongoing
        assigned_technician_id: shouldAssign ? followUpAssignTechnicianId : null,
        assigned_date: shouldAssign ? new Date().toISOString() : null,
        assigned_by: shouldAssign ? (user?.id || null) : null,
        // Drop team so the next primary assignee is the only link (avoids stale team_members vs new assignee).
        team_members: [],
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

      if (shouldAssign) {
        broadcastTechnicianJobListRefresh([followUpAssignTechnicianId]);
      }

      // Update local state
      setJobs(prev => prev.map(j => {
        if (j.id === selectedJobForMoveToOngoing.id) {
          const updatedJob = { 
            ...j, 
            status: 'PENDING', 
            assignedDate: null,
            assignedTechnicianId: null,
            assigned_technician_id: null,
            team_members: [] as string[],
            scheduledDate: moveToOngoingDate,
            scheduledTimeSlot: timeSlotToUse,
            requirements: requirements,
            // Clear all followup-related fields
            followUpDate: null,
            follow_up_date: null,
            followUpTime: null,
            follow_up_time: null,
            followUpNotes: null,
            follow_up_notes: null,
            followUpScheduledBy: null,
            follow_up_scheduled_by: null,
            followUpScheduledAt: null,
            follow_up_scheduled_at: null
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
                team_members: [] as string[],
                scheduledDate: moveToOngoingDate,
                scheduledTimeSlot: timeSlotToUse,
                requirements: requirements,
                // Clear all followup-related fields
                followUpDate: null,
                follow_up_date: null,
                followUpTime: null,
                follow_up_time: null,
                followUpNotes: null,
                follow_up_notes: null,
                followUpScheduledBy: null,
                follow_up_scheduled_by: null,
                followUpScheduledAt: null,
                follow_up_scheduled_at: null
              };
            }
            return job;
          });
        });
        return updated;
      });

      // Reload jobs to ensure everything is updated everywhere
      await loadFilteredJobs(statusFilter, currentPage);

      // Refresh the follow-up glow (red/yellow) so the stats card updates immediately
      // now that this job is no longer a today/tomorrow follow-up.
      db.jobs.getFollowUpForGlow().then(({ data }) => {
        if (data) setAllFollowUpJobs(data as Job[]);
      }).catch(() => {});

      toast.success('Job moved to ongoing with updated schedule');

      // If this was a follow-up "Assign" flow, assignment was applied as part of the move-to-ongoing update.
      if (assignAfterMoveToOngoing) {
        const assignedTechnician = technicians.find((t) => t.id === followUpAssignTechnicianId);
        if (assignedTechnician) {
          const notification = createJobAssignedNotification(
            (selectedJobForMoveToOngoing as any).job_number || (selectedJobForMoveToOngoing as any).jobNumber || 'Job',
            ((selectedJobForMoveToOngoing as any).customer as any)?.full_name || ((selectedJobForMoveToOngoing as any).customer as any)?.fullName || 'Customer',
            assignedTechnician.fullName,
            (selectedJobForMoveToOngoing as any).id,
            assignedTechnician.id
          );
          await sendNotification(notification);
        }
        setAssignAfterMoveToOngoing(false);
        setFollowUpAssignTechnicianId('');
      }

      // Close dialog and reset state
      setMoveToOngoingDialogOpen(false);
      setSelectedJobForMoveToOngoing(null);
      setMoveToOngoingDate('');
      setMoveToOngoingTimeSlot('MORNING');
      setMoveToOngoingCustomTime('');
    } catch (error) {
      console.error('Error moving job to ongoing:', error);
      toast.error('Failed to move job to ongoing');
      setAssignAfterMoveToOngoing(false);
      setFollowUpAssignTechnicianId('');
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
        const { data: fullJob, error } = await db.jobs.getByIdFull(job.id);
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
    openAdminModal('deny', { jobId: jobWithCustomer.id });
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

  // Handle completion email sent (separate from WhatsApp message_sent)
  const handleMailSent = async (jobId: string) => {
    try {
      const job = jobs.find(j => j.id === jobId);
      if (!job) return;

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

      const mailIndex = requirements.findIndex((r: any) => r?.mail_sent !== undefined);
      if (mailIndex >= 0) {
        requirements[mailIndex].mail_sent = true;
        requirements[mailIndex].mail_sent_at = new Date().toISOString();
      } else {
        let added = false;
        for (let i = 0; i < requirements.length; i++) {
          if (requirements[i] && typeof requirements[i] === 'object' && !Array.isArray(requirements[i])) {
            requirements[i].mail_sent = true;
            requirements[i].mail_sent_at = new Date().toISOString();
            added = true;
            break;
          }
        }
        if (!added) {
          requirements.push({
            mail_sent: true,
            mail_sent_at: new Date().toISOString(),
          });
        }
      }

      const { error } = await db.jobs.update(jobId, {
        requirements: JSON.stringify(requirements),
      } as any);

      if (error) {
        console.error('Error marking mail as sent:', error);
        toast.error('Failed to save mail status: ' + error.message);
      } else {
        await loadCompletedJobDetails(jobId);
        await loadFilteredJobs(statusFilter, currentPage);
      }
    } catch (error: any) {
      console.error('Error marking mail as sent:', error);
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
      const messageIndex = requirements.findIndex((r: any) => r?.message_sent !== undefined);
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
        closeAdminModal();
        setSelectedJobForMessage(null);
        // Ensure the updated `requirements` are reflected in the Completed Jobs UI.
        // The main Completed filter list can be fetched in "slim" mode where `requirements` are omitted,
        // so we explicitly load the full job details for this job id.
        await loadCompletedJobDetails(jobId);
        // Reload jobs to reflect the change - pass current filter and page
        await loadFilteredJobs(statusFilter, currentPage);
      }
    } catch (error: any) {
      console.error('Error marking message as sent:', error);
    }
  };

  // Calculate AMC end date: agreement date + years - 1 day
  // calculateAMCEndDate moved to CompleteJobDialog component

  // Handle job completion - first show technician selection
  const snapshotJobAssignmentForCompleteFlow = (job: Job) => {
    const assignedTechnicianId =
      (job as any).assigned_technician_id ?? job.assignedTechnicianId ?? null;
    completeFlowSnapshotRef.current = {
      jobId: job.id,
      assignedTechnicianId: assignedTechnicianId ? String(assignedTechnicianId) : null,
      status: job.status,
      assignedDate: (job as any).assigned_date ?? job.assignedDate ?? null,
    };
  };

  const clearCompleteFlowSnapshot = () => {
    completeFlowSnapshotRef.current = null;
  };

  const revertIncompleteCompleteFlow = useCallback(async () => {
    const snapshot = completeFlowSnapshotRef.current;
    if (!snapshot) return;
    completeFlowSnapshotRef.current = null;

    const applyLocalRevert = () => {
      setJobs((prev) =>
        prev.map((job) =>
          job.id === snapshot.jobId
            ? {
                ...job,
                assigned_technician_id: snapshot.assignedTechnicianId,
                assignedTechnicianId: snapshot.assignedTechnicianId,
                assigned_date: snapshot.assignedDate,
                assignedDate: snapshot.assignedDate,
                status: snapshot.status as Job['status'],
              }
            : job
        )
      );
      setCustomerJobs((prev) => {
        const updated = { ...prev };
        Object.keys(updated).forEach((customerId) => {
          updated[customerId] = updated[customerId].map((job) =>
            job.id === snapshot.jobId
              ? {
                  ...job,
                  assigned_technician_id: snapshot.assignedTechnicianId,
                  assignedTechnicianId: snapshot.assignedTechnicianId,
                  assigned_date: snapshot.assignedDate,
                  assignedDate: snapshot.assignedDate,
                  status: snapshot.status as Job['status'],
                }
              : job
          );
        });
        return updated;
      });
    };

    applyLocalRevert();

    try {
      const { data, error } = await db.jobs.getById(snapshot.jobId);
      if (error || !data) return;

      const row = data as Record<string, unknown>;
      const status = String(row.status || '');
      if (status === 'COMPLETED') return;

      const currentAssign = row.assigned_technician_id ? String(row.assigned_technician_id) : null;
      if (currentAssign === snapshot.assignedTechnicianId) return;

      const { error: updateError } = await db.jobs.update(snapshot.jobId, {
        assigned_technician_id: snapshot.assignedTechnicianId,
        assigned_date: snapshot.assignedDate,
        status: snapshot.status,
      });
      if (updateError) {
        console.warn(
          '[AdminDashboard] Could not revert assignment after cancelled complete flow:',
          updateError
        );
        return;
      }

      const techIds = [currentAssign, snapshot.assignedTechnicianId].filter(Boolean) as string[];
      if (techIds.length) broadcastTechnicianJobListRefresh(techIds);
    } catch (err) {
      console.warn('[AdminDashboard] Revert complete-flow assignment failed:', err);
    }
  }, []);

  const handleCompleteJob = async (job: Job) => {
    // Fetch full job data with customer if not already loaded
    let jobWithCustomer = job;
    if (!job.customer || !job.serviceType) {
      try {
        const { data: fullJob, error } = await db.jobs.getByIdFull(job.id);
        if (!error && fullJob) {
          jobWithCustomer = fullJob as Job;
        }
      } catch (error) {
        console.error('Error fetching job details:', error);
        // Continue with the job data we have
      }
    }
    
    setSelectedJobForComplete(jobWithCustomer);
    snapshotJobAssignmentForCompleteFlow(jobWithCustomer);
    setSelectedTechnicianForComplete('');
    openAdminModal('complete', { jobId: jobWithCustomer.id });
    setTechnicianSelectDialogOpen(true);
  };

  // Handle technician selection for job completion
  const handleTechnicianSelectedForComplete = async () => {
    if (!selectedTechnicianForComplete || !selectedJobForComplete) {
      toast.error('Please select who completed the job');
      return;
    }

    const isOfficeCompletion = selectedTechnicianForComplete === 'office';

    if (!isOfficeCompletion) {
      // Validate technician ID format (should be a valid UUID)
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(selectedTechnicianForComplete)) {
        console.error('Invalid technician ID format:', selectedTechnicianForComplete);
        toast.error('Invalid technician selected. Please try again.');
        return;
      }

      // Verify technician exists in the technicians list
      const selectedTechnician = technicians.find(t => t.id === selectedTechnicianForComplete);
      if (!selectedTechnician) {
        console.error('Technician not found in list:', selectedTechnicianForComplete);
        toast.error('Selected technician not found. Please refresh and try again.');
        return;
      }
    }

    // Always fetch fresh QR codes when completing a job (cache can miss newly created codes)
    void loadQrCodes(true).catch((err) => console.error('Error loading QR codes:', err));

    // Assignment is applied only when the job is actually completed.
    // If the dialog is closed early, revertIncompleteCompleteFlow restores the prior assignment.

    suppressCompleteFlowRevertRef.current = true;
    setTechnicianSelectDialogOpen(false);
    setCompleteDialogOpen(true);
  };

  // Handle job deletion
  const handleDeleteJob = async () => {
    if (!jobToDelete) return;
    
    try {
      broadcastTechnicianJobListRefreshForJob(jobToDelete);
      const { error } = await db.jobs.delete(jobToDelete.id);
      
      if (error) {
        const msg = error.message || 'Failed to delete job';
        if (error.code === '409' || /409|conflict|foreign key|23503/i.test(msg)) {
          throw new Error(
            'Could not delete this job. Re-run scripts/delete-job-admin-rpc.sql and scripts/technician-job-sync-realtime.sql in Supabase SQL Editor.'
          );
        }
        throw new Error(msg);
      }

      const deletedId = jobToDelete.id;
      // Update local state
      setJobs(prev => prev.filter(job => job.id !== deletedId));
      setCustomerJobs(prev => {
        const updated = { ...prev };
        Object.keys(updated).forEach(customerId => {
          updated[customerId] = updated[customerId].filter(job => job.id !== deletedId);
        });
        return updated;
      });
      setLoadedCompletedJobDetails((prev) => {
        if (!prev[deletedId]) return prev;
        const next = { ...prev };
        delete next[deletedId];
        return next;
      });
      setLoadingCompletedJobDetails((prev) => {
        if (!prev[deletedId]) return prev;
        const next = { ...prev };
        delete next[deletedId];
        return next;
      });
      if (statusFilter === 'COMPLETED' || statusFilter === 'CANCELLED') {
        setTotalCount((prev) => Math.max(0, prev - 1));
      }

      toast.success(`Job ${jobToDelete.job_number || jobToDelete.jobNumber} deleted successfully`);
      closeAdminModal();
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
      const photoType = type === 'before' || type === 'after' ? type : 'after';
      openAdminModal('photos', { jobId, photoType });
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
  const openPhotoViewer = (photoUrl: string, photoIndex: number, totalPhotos: number, jobId?: string) => {
    setSelectedPhoto({ url: photoUrl, index: photoIndex, total: totalPhotos });
    const parsed = parseAdminDashboardUrl(location.search);
    openAdminModal('photo-viewer', {
      jobId: jobId ?? parsed.jobId ?? undefined,
      photoIdx: photoIndex,
    });
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
    
    // Use selectedCustomerPhotos if available (for customer photos)
    if (selectedCustomerPhotos && selectedCustomerPhotos.length > 0) {
      const newIndex = selectedPhoto.index > 0 ? selectedPhoto.index - 1 : selectedCustomerPhotos.length - 1;
      setSelectedPhoto({ 
        url: selectedCustomerPhotos[newIndex], 
        index: newIndex, 
        total: selectedCustomerPhotos.length 
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
    
    // Use selectedCustomerPhotos if available (for customer photos)
    if (selectedCustomerPhotos && selectedCustomerPhotos.length > 0) {
      const newIndex = selectedPhoto.index < selectedCustomerPhotos.length - 1 ? selectedPhoto.index + 1 : 0;
      setSelectedPhoto({ 
        url: selectedCustomerPhotos[newIndex], 
        index: newIndex, 
        total: selectedCustomerPhotos.length 
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
    // Fetch as a blob so cross-origin (Cloudinary) images actually save to the device.
    // The anchor `download` attribute is ignored for cross-origin URLs, which is why a
    // plain link just opened/redirected instead of downloading.
    try {
      let fetchUrl = photoUrl;
      if (photoUrl.includes('cloudinary.com')) {
        // Strip transformations to get the original asset.
        fetchUrl = photoUrl.replace(/\/upload\/[^/]*\//, '/upload/');
      }

      const response = await fetch(fetchUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();

      // Pick an extension from the blob's mime type when available.
      const ext = blob.type && blob.type.includes('/') ? blob.type.split('/')[1].split('+')[0] : 'jpg';

      // Build a meaningful filename: "<Customer> <bill|payment> <n>" when we know the
      // context (e.g. opened from a customer report), otherwise fall back to "photo-<n>".
      const sanitize = (s: string) => s.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '');
      let baseName = `photo-${photoIndex + 1}`;
      if (photoDownloadMeta?.customerName || photoDownloadMeta?.type) {
        const parts = [
          photoDownloadMeta.customerName ? sanitize(photoDownloadMeta.customerName) : '',
          photoDownloadMeta.type === 'bill' ? 'bill' : photoDownloadMeta.type === 'payment' ? 'payment' : sanitize(photoDownloadMeta.type || ''),
          String(photoIndex + 1),
        ].filter(Boolean);
        baseName = parts.join('_');
      }

      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `${baseName}.${ext}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);

      toast.success('Photo downloaded');
    } catch (error) {
      // Fallback - open in new tab for manual save (e.g. if fetch is blocked by CORS).
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
      const updatedBeforePhotos = [...beforePhotos];
      const updatedAfterPhotos = [...afterPhotos];
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
      let cloudinaryDeleted = false;
      let cloudinaryErrorMsg: string | undefined;
      try {
        const publicIdInfo = cloudinaryService.extractPublicId(photoToDelete.photoUrl);
        if (publicIdInfo) {
          const result = await cloudinaryService.deleteImage(publicIdInfo.publicId, publicIdInfo.useSecondary);
          if (result.success) {
            console.log(`✅ Photo deleted from Cloudinary: ${publicIdInfo.publicId}`);
            cloudinaryDeleted = true;
          } else {
            cloudinaryErrorMsg = result.error;
            console.warn(`⚠️ Failed to delete photo from Cloudinary: ${publicIdInfo.publicId}`, result.error);
          }
        } else {
          console.warn('Could not extract public_id from URL:', photoToDelete.photoUrl);
        }
      } catch (cloudinaryError) {
        cloudinaryErrorMsg = cloudinaryError instanceof Error ? cloudinaryError.message : 'Request failed';
        console.error('Error deleting photo from Cloudinary:', cloudinaryError);
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

      // Show appropriate success message
      if (cloudinaryDeleted) {
        toast.success('Photo deleted successfully from both database and Cloudinary');
      } else {
        toast.success(cloudinaryErrorMsg ? `Photo removed from database. Cloudinary: ${cloudinaryErrorMsg}` : 'Photo removed from database. Cloudinary delete failed.');
      }
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

      const { data: customerJobsData, error: jobsError } = await db.jobs.getByCustomerIdForPhotoAggregation(
        customer.id
      );
      if (jobsError) {
        throw new Error(jobsError.message);
      }
      const customerJobs = customerJobsData || [];

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

      // If photo wasn't found in any job, check customer-level photos (photos added without a job)
      if (!photoFound) {
        const customerPhotosList = Array.isArray((customer as any).photos) ? (customer as any).photos : [];
        const customerPhotoIndex = customerPhotosList.findIndex((p: any) => normalizeUrl(extractPhotoUrl(p)) === normalizedPhotoUrl);
        if (customerPhotoIndex !== -1) {
          const updatedCustomerPhotos = customerPhotosList.filter((_: any, i: number) => i !== customerPhotoIndex);
          const { error: updateError } = await db.customers.update(customer.id, { photos: updatedCustomerPhotos } as any);
          if (updateError) {
            console.error('Error updating customer photos:', updateError);
            throw new Error(updateError.message || 'Failed to remove photo from customer');
          }
          photoFound = true;
        }
      }

      // Delete from Cloudinary if it's a Cloudinary URL (always attempt, even if not found in DB)
      let cloudinaryDeleted = false;
      let cloudinaryErrorMsg: string | undefined;
      try {
        const publicIdInfo = cloudinaryService.extractPublicId(photoUrl);
        if (publicIdInfo) {
          const result = await cloudinaryService.deleteImage(publicIdInfo.publicId, publicIdInfo.useSecondary);
          if (result.success) {
            console.log(`✅ Photo deleted from Cloudinary: ${publicIdInfo.publicId}`);
            cloudinaryDeleted = true;
          } else {
            cloudinaryErrorMsg = result.error;
            console.warn(`⚠️ Failed to delete photo from Cloudinary: ${publicIdInfo.publicId}`, result.error);
          }
        } else {
          console.warn('Could not extract public_id from URL:', photoUrl);
        }
      } catch (cloudinaryError) {
        cloudinaryErrorMsg = cloudinaryError instanceof Error ? cloudinaryError.message : 'Request failed';
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
      } else if (photoFound || !cloudinaryErrorMsg) {
        toast.success(cloudinaryErrorMsg ? `Photo removed from database. Cloudinary: ${cloudinaryErrorMsg}` : 'Photo removed from database.');
      } else {
        toast.warning(`Photo removed from UI. Cloudinary: ${cloudinaryErrorMsg}`);
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


  // When user has searched, use API results (find any customer in DB); otherwise use derived list (customers with jobs)
  const baseCustomers = searchTerm.trim() ? (searchResults ?? []) : customers;

  // Filter data based on search term when NOT using API search (empty search = use all derived customers)
  const filteredCustomers = searchTerm.trim()
    ? baseCustomers
    : customers;

  // Helper function to get completion date for a job
  const getJobCompletionDate = (job: Job): number => {
    const completedAt = (job as any).completed_at || job.completedAt;
    const endTime = (job as any).end_time || job.endTime;
    const completionDate = completedAt || endTime;
    if (completionDate) {
      return new Date(completionDate).getTime();
    }
    // Fallback to scheduled date or created date if no completion date
    const scheduledDate = (job as any).scheduled_date || job.scheduledDate;
    if (scheduledDate) {
      return new Date(scheduledDate).getTime();
    }
    return new Date(job.createdAt).getTime();
  };
  function doesCompletedJobMatchFilters(job: any): boolean {
    return completedJobMatchesDashboardClientFilters(job, {
      leadType: completedLeadTypeFilter,
      serviceSubType: completedServiceSubTypeFilter,
      completedBy: completedByFilter,
    }, technicians as any);
  }

  // Group customers with their jobs (uses baseCustomers so search results get their jobs from current view)
  const customersWithJobs = baseCustomers.map(customer => {
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
    
    // Sort completed jobs by completion date (latest first)
    const completedJobs = customerJobs
      .filter(job => job.status === 'COMPLETED')
      .sort((a, b) => {
        const aCompletionDate = getJobCompletionDate(a);
        const bCompletionDate = getJobCompletionDate(b);
        return bCompletionDate - aCompletionDate; // Latest completed first
      });
    
    return {
      customer,
      allJobs: customerJobs,
      upcomingJobs: customerJobs.filter(job => ['PENDING', 'ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS'].includes(job.status)),                                                    
      completedJobs: completedJobs,
      cancelledJobs: customerJobs.filter(job => job.status === 'CANCELLED')
    };
  });
  
  // Customers with Jobs processing complete

  // Filter customers based on status filter
  const getFilteredCustomers = () => {
    // For COMPLETED and CANCELLED, use jobs directly since they're paginated
    if (statusFilter === 'COMPLETED' || statusFilter === 'CANCELLED') {
      // Group loaded jobs by customer
      const customerMap = new Map<string, { customer: Customer; todayJobs: Job[] }>();
      
      // First, collect all customers who have jobs for the selected date/range.
      // Note: jobs array is paginated, so if there are multiple pages,
      // we only see customers from the current page. This is intentional for performance.

      jobs.forEach(job => {
        let customer = (job as any).customer || job.customer;
        const fallbackCustomerId = (job as any).customer_id || (job as any).customerId;
        if (!customer) {
          if (!fallbackCustomerId) {
            if (import.meta.env.DEV) {
              console.warn('Job missing customer relationship:', {
                jobId: job.id,
                jobNumber: job.job_number || job.jobNumber,
                hasCustomerField: !!(job as any).customer || !!job.customer,
                status: job.status,
                completedAt: (job as any).completed_at || job.completedAt,
                endTime: (job as any).end_time || job.endTime
              });
            }
            return;
          }
          // Orphan job or embed failed: still show the row so pagination is not a blank page.
          customer = {
            id: fallbackCustomerId,
            customer_id: null,
            full_name: 'Customer record unavailable',
            phone: '',
            alternate_phone: null,
            email: null,
            visible_address: '',
            address: {},
            location: null,
            service_type: null,
            brand: null,
            model: null,
            installation_date: null,
            warranty_expiry: null,
            status: null,
            customer_since: null,
            last_service_date: null,
            notes: null,
            preferred_time_slot: null,
            preferred_language: null,
            has_prefilter: null,
            has_google_review: null,
            customer_tier: null,
            raw_water_tds: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
        }
        
        const customerId = customer.id;
        if (!customerId) {
          if (import.meta.env.DEV) {
            console.warn('Customer missing ID:', customer);
          }
          return;
        }
        
        if (!customerMap.has(customerId)) {
          customerMap.set(customerId, {
            customer: transformCustomerData(customer),
            todayJobs: []
          });
        }
        customerMap.get(customerId)!.todayJobs.push(job);
      });
      
      // Debug logging for COMPLETED filter
      if (import.meta.env.DEV && statusFilter === 'COMPLETED') {
        console.log('Completed jobs filter - customer grouping:', {
          totalJobs: jobs.length,
          uniqueCustomers: customerMap.size,
          dateFilter: completedDateFilter,
          currentPage,
          totalPages,
          totalCount,
          customers: Array.from(customerMap.entries()).map(([id, { customer, todayJobs }]) => ({
            customerId: id,
            customer_id: (customer as any).customer_id || customer.customerId,
            name: customer.fullName || (customer as any).full_name,
            jobCount: todayJobs.length,
            jobNumbers: todayJobs.map(j => j.job_number || j.jobNumber)
          }))
        });
      }
      
      // For each customer, use the jobs from the paginated query for the selected date
      // Don't use customerHistory here as it might contain jobs from other dates
      // The database query already filtered by date, so todayJobs contains the correct filtered jobs
      return Array.from(customerMap.values())
        .map(({ customer, todayJobs }) => {
          // For COMPLETED filter with date selection, use only the paginated jobs for that date
          // This ensures we show only customers who have jobs on the selected date
          const allJobs = statusFilter === 'COMPLETED'
            ? todayJobs.filter((job) => job.status === 'COMPLETED' && doesCompletedJobMatchFilters(job))
            : todayJobs;
          
          // Sort completed jobs by completion date (latest first)
          const completedJobs = allJobs
            .filter(job => job.status === 'COMPLETED')
            .sort((a, b) => {
              const aCompletionDate = getJobCompletionDate(a);
              const bCompletionDate = getJobCompletionDate(b);
              return bCompletionDate - aCompletionDate; // Latest completed first
            });
          
          return {
            customer,
            allJobs, // Use only jobs from the paginated query (filtered by date)
            upcomingJobs: allJobs.filter(job => ['PENDING', 'ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS'].includes(job.status)),
            completedJobs: completedJobs,
            cancelledJobs: allJobs.filter(job => job.status === 'CANCELLED' || job.status === 'DENIED')
          };
        })
        .filter((entry) => statusFilter !== 'COMPLETED' || entry.completedJobs.length > 0)
        .sort((a, b) => {
          // Sort customers by their most recent completed job date (latest first)
          const aMostRecentCompleted = a.completedJobs.length > 0 
            ? getJobCompletionDate(a.completedJobs[0]) 
            : 0;
          const bMostRecentCompleted = b.completedJobs.length > 0 
            ? getJobCompletionDate(b.completedJobs[0]) 
            : 0;
          return bMostRecentCompleted - aMostRecentCompleted;
        });
    }
    
    let filteredCustomers = customersWithJobs;
    
    // Apply status filter
    if (statusFilter === 'ALL') {
      // Show all customers regardless of job status (including those with no jobs)
      filteredCustomers = customersWithJobs;
    } else if (statusFilter === 'ONGOING') {
      // Show customers with ongoing jobs (pending, assigned, in-progress)
      filteredCustomers = customersWithJobs.filter(({ allJobs }) => 
        allJobs.some((job: any) => doesOngoingJobMatchFilters(job))
      );
    } else if (statusFilter === 'RESCHEDULED') {
      // For RESCHEDULED, use jobs if loaded via pagination, otherwise filter customersWithJobs
      if (jobs.length > 0 && jobs.some(j => ['FOLLOW_UP', 'RESCHEDULED'].includes(j.status))) {
        const customerMap = new Map<string, { customer: Customer; allJobs: Job[] }>();
        // Filter out customers that have been deleted (verify customer still exists)
        const existingCustomerIds = new Set(baseCustomers.map(c => c.id));

        jobs.forEach(job => {
          const customer = (job as any).customer || job.customer;
          if (!customer) return;
          const customerId = customer.id;

          // IMPORTANT: Filter out customers that have been deleted
          if (!existingCustomerIds.has(customerId)) {
            if (import.meta.env.DEV) {
              console.warn('Skipping RESCHEDULED job with deleted customer:', {
                jobId: job.id,
                jobNumber: job.job_number || job.jobNumber,
                customerId: customerId
              });
            }
            return; // Skip jobs for deleted customers
          }
          
          if (!customerMap.has(customerId)) {
            customerMap.set(customerId, {
              customer: transformCustomerData(customer),
              allJobs: []
            });
          }
          customerMap.get(customerId)!.allJobs.push(job);
        });
        
        let customersList = Array.from(customerMap.values()).map(({ customer, allJobs }) => {
          // Sort completed jobs by completion date (latest first)
          const completedJobs = allJobs
            .filter(job => job.status === 'COMPLETED')
            .sort((a, b) => {
              const aCompletionDate = getJobCompletionDate(a);
              const bCompletionDate = getJobCompletionDate(b);
              return bCompletionDate - aCompletionDate; // Latest completed first
            });
          
          return {
            customer,
            allJobs,
            upcomingJobs: allJobs.filter(job => ['PENDING', 'ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS'].includes(job.status)),
            completedJobs: completedJobs,
            cancelledJobs: allJobs.filter(job => job.status === 'CANCELLED' || job.status === 'DENIED')
          };
        });
        
        // Filter customers by followup date (within 7 days) if not showing all
        if (!showAllFollowups) {
          const now = new Date();
          const weekFromNow = new Date(now);
          weekFromNow.setDate(weekFromNow.getDate() + 7);
          
          customersList = customersList.filter(({ allJobs }) => {
            const followUpJobs = allJobs.filter(job => ['FOLLOW_UP', 'RESCHEDULED'].includes(job.status));
            // Check if customer has at least one followup within 7 days
            return followUpJobs.some((job: any) => {
              const followUpDate = job.follow_up_date || job.followUpDate;
              if (!followUpDate) return true; // Show customers with jobs without date
              const followUpDateObj = new Date(followUpDate);
              if (isNaN(followUpDateObj.getTime())) return true;
              return followUpDateObj <= weekFromNow;
            });
          });
        }
        
        return customersList;
      }
      // Filter for follow-up jobs (FOLLOW_UP and RESCHEDULED status)
      filteredCustomers = customersWithJobs.filter(({ allJobs }) => 
        allJobs.some(job => ['FOLLOW_UP', 'RESCHEDULED'].includes(job.status))
      );
      
      // Filter customers by followup date (within 7 days) if not showing all
      if (!showAllFollowups) {
        const now = new Date();
        const weekFromNow = new Date(now);
        weekFromNow.setDate(weekFromNow.getDate() + 7);
        
        filteredCustomers = filteredCustomers.filter(({ allJobs }) => {
          const followUpJobs = allJobs.filter(job => ['FOLLOW_UP', 'RESCHEDULED'].includes(job.status));
          // Check if customer has at least one followup within 7 days
          return followUpJobs.some((job: any) => {
            const followUpDate = job.follow_up_date || job.followUpDate;
            if (!followUpDate) return true; // Show customers with jobs without date
            const followUpDateObj = new Date(followUpDate);
            if (isNaN(followUpDateObj.getTime())) return true;
            return followUpDateObj <= weekFromNow;
          });
        });
      }
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

  // Get today's and tomorrow's date strings for filtering followups (local YYYY-MM-DD)
  const todayDateStr = getTodayLocalDate();
  const tomorrowDateStr = getTomorrowLocalDate();
  const followUpDateToStr = (followUpDate: string | null | undefined): string | null => {
    if (!followUpDate) return null;
    if (followUpDate.includes('T')) {
      const d = new Date(followUpDate);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    return followUpDate.split('T')[0].trim();
  };

  const getJobServiceSubTypeLabel = (job: any): string => {
    return normalizeServiceSubType(String(job?.service_sub_type ?? job?.serviceSubType ?? '').trim()) || '';
  };
  const getJobAssignedTechnicianId = (job: any): string => {
    return String(
      job?.assigned_technician_id ??
        job?.assignedTechnicianId ??
        job?.assignedTechnician?.id ??
        ''
    ).trim();
  };
  const doesOngoingJobMatchFilters = useCallback((job: any): boolean => {
    // status gate (Ongoing section only)
    if (!['PENDING', 'ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS'].includes(job?.status)) return false;

    const assignedTechnicianId = getJobAssignedTechnicianId(job);
    const isAssigned = Boolean(assignedTechnicianId);

    if (ongoingAssignmentFilter === 'assigned' && !isAssigned) return false;
    if (ongoingAssignmentFilter === 'unassigned' && isAssigned) return false;

    if (ongoingAssignedTechnicianFilter !== 'all') {
      if (!assignedTechnicianId) return false;
      if (assignedTechnicianId !== String(ongoingAssignedTechnicianFilter)) return false;
    }

    if (ongoingServiceSubTypeFilter !== 'all') {
      const st = getJobServiceSubTypeLabel(job);
      if (!st) return false;
      if (st !== String(ongoingServiceSubTypeFilter)) return false;
    }

    return true;
  }, [ongoingAssignmentFilter, ongoingAssignedTechnicianFilter, ongoingServiceSubTypeFilter]);

  const ongoingServiceSubTypeOptions = useMemo(() => {
    if (statusFilter !== 'ONGOING') return [] as string[];
    // Keep this local to avoid TDZ issues (completed master list is declared later in the file).
    const MASTER_ONGOING_SERVICE_SUB_TYPES = [
      'Service',
      'Installation',
      'Reinstallation',
      'Return Complaint',
      'Return Service',
      'AMC Service',
      'New Purifier Installation',
      'Un-Installation',
      'Repair',
      'Maintenance',
      'Replacement',
      'Inspection',
      'Other',
    ];
    const set = new Set<string>();
    customersWithJobs.forEach(({ allJobs }) => {
      allJobs.forEach((job: any) => {
        if (!['PENDING', 'ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS'].includes(job?.status)) return;
        const label = getJobServiceSubTypeLabel(job);
        if (label) set.add(label);
      });
    });
    const extras = Array.from(set).filter((x) => !MASTER_ONGOING_SERVICE_SUB_TYPES.includes(x));
    return [...MASTER_ONGOING_SERVICE_SUB_TYPES, ...extras.sort((a, b) => a.localeCompare(b))];
  }, [customersWithJobs, statusFilter]);

  const hasOngoingClientFilters =
    ongoingAssignmentFilter !== 'all' ||
    ongoingAssignedTechnicianFilter !== 'all' ||
    ongoingServiceSubTypeFilter !== 'all';

  const clearOngoingFilters = useCallback(() => {
    setOngoingAssignmentFilter('all');
    setOngoingAssignedTechnicianFilter('all');
    setOngoingServiceSubTypeFilter('all');
    setDraftOngoingAssignmentFilter('all');
    setDraftOngoingAssignedTechnicianFilter('all');
    setDraftOngoingServiceSubTypeFilter('all');
  }, []);

  useEffect(() => {
    if (!ongoingFilterDialogOpen) return;
    setDraftOngoingAssignmentFilter(ongoingAssignmentFilter);
    setDraftOngoingAssignedTechnicianFilter(ongoingAssignedTechnicianFilter);
    setDraftOngoingServiceSubTypeFilter(ongoingServiceSubTypeFilter);
  }, [
    ongoingFilterDialogOpen,
    ongoingAssignmentFilter,
    ongoingAssignedTechnicianFilter,
    ongoingServiceSubTypeFilter,
  ]);
  const completedDateToStr = (dateValue: string | null | undefined): string | null => {
    if (!dateValue) return null;
    const d = new Date(dateValue);
    if (Number.isNaN(d.getTime())) return null;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const isDateWithinCompletedRange = (dateStr: string | null): boolean => {
    if (!dateStr) return false;
    if (completedDatePreset === 'day') {
      return dateStr === completedDateFilter;
    }
    const start = completedRangeStartDate <= completedRangeEndDate ? completedRangeStartDate : completedRangeEndDate;
    const end = completedRangeStartDate <= completedRangeEndDate ? completedRangeEndDate : completedRangeStartDate;
    return dateStr >= start && dateStr <= end;
  };

  const isZeroCommissionCompletedJob = useCallback((job: any): boolean => {
    const completedBy = String(job?.completed_by || job?.completedBy || '').trim();
    if (completedBy === ZERO_COMMISSION_EMPLOYEE_ID) return true;

    const technicianPool = techniciansForReports.length > 0 ? techniciansForReports : technicians;
    return technicianPool.some((tech: any) => {
      const technicianId = String(tech.id || '').trim();
      const employeeId = String(tech.employee_id || tech.employeeId || '').trim();
      return (
        employeeId === ZERO_COMMISSION_EMPLOYEE_ID &&
        (completedBy === technicianId || completedBy === employeeId)
      );
    });
  }, [technicians, techniciansForReports]);

  const getCompletedJobBillAmount = useCallback((job: any): number => {
    const paymentAmount = Number(job?.payment_amount ?? job?.paymentAmount ?? 0) || 0;
    const actualCost = Number(job?.actual_cost ?? job?.actualCost ?? 0) || 0;
    let billAmount = paymentAmount > 0 ? paymentAmount : actualCost;

    if (billAmount <= 0 && (job?.payment_method || job?.paymentMethod) === 'PARTIAL') {
      const requirements = parseJobRequirements(job?.requirements || []);
      const partialReq = requirements.find(
        (r: any) => r?.partial_cash_amount != null || r?.partial_online_amount != null
      );
      if (partialReq) {
        const cash = Number(partialReq.partial_cash_amount) || 0;
        const online = Number(partialReq.partial_online_amount) || 0;
        if (cash + online > 0) billAmount = cash + online;
      }
    }

    return billAmount;
  }, []);

  const calculateCompletedJobProfit = useCallback((job: any) => {
    const revenue = getCompletedJobBillAmount(job);
    const sparePartsCost = Number(job?.parts_cost_total ?? job?.partsCostTotal ?? 0) || 0;
    const leadCost = Number(job?.lead_cost ?? job?.leadCost ?? 0) || 0;
    const commission = isZeroCommissionCompletedJob(job) ? 0 : revenue * 0.1;
    return {
      revenue,
      sparePartsCost,
      leadCost,
      commission,
      profit: revenue - sparePartsCost - leadCost - commission,
    };
  }, [getCompletedJobBillAmount, isZeroCommissionCompletedJob]);

  const displayedCustomers = !searchTerm.trim()
    ? (() => {
        const filtered = getFilteredCustomers();
        // For COMPLETED filter, sort by most recent completed job date (latest first)
        if (statusFilter === 'COMPLETED') {
          return filtered.sort((a, b) => {
            const aMostRecentCompleted = a.completedJobs.length > 0 
              ? getJobCompletionDate(a.completedJobs[0]) 
              : 0;
            const bMostRecentCompleted = b.completedJobs.length > 0 
              ? getJobCompletionDate(b.completedJobs[0]) 
              : 0;
            return bMostRecentCompleted - aMostRecentCompleted;
          });
        }
        // For ONGOING filter, sort by most recently created ongoing job (newest first)
        if (statusFilter === 'ONGOING') {
          return filtered.sort((a, b) => {
            // Get most recently created ongoing job for each customer
            const getMostRecentOngoingJobDate = (customer: typeof filtered[0]): number => {
              const ongoingJobs = customer.allJobs.filter((job: any) => doesOngoingJobMatchFilters(job));
              if (ongoingJobs.length === 0) return 0;
              
              const dates = ongoingJobs
                .map(job => {
                  const createdAt = (job as any).created_at || job.createdAt;
                  return createdAt ? new Date(createdAt).getTime() : 0;
                })
                .filter((d): d is number => d !== 0)
                .sort((x, y) => y - x); // Sort descending (newest first)
              
              return dates.length > 0 ? dates[0] : 0;
            };
            
            const aMostRecent = getMostRecentOngoingJobDate(a);
            const bMostRecent = getMostRecentOngoingJobDate(b);
            
            // Sort by most recently created ongoing job (descending - newest first)
            return bMostRecent - aMostRecent;
          });
        }
        // For RESCHEDULED filter, sort by follow-up date: today first, tomorrow next, then later by date
        if (statusFilter === 'RESCHEDULED') {
          return filtered.sort((a, b) => {
            const getClosestFollowUpRankAndTime = (customer: typeof filtered[0]): { rank: number; time: number } | null => {
              const followUpJobs = customer.allJobs.filter(job =>
                ['FOLLOW_UP', 'RESCHEDULED'].includes(job.status)
              );
              if (followUpJobs.length === 0) return null;
              const withRank = followUpJobs
                .map(job => {
                  const fd = job.followUpDate || (job as any).follow_up_date;
                  const dateStr = fd ? followUpDateToStr(fd) : null;
                  if (!dateStr) return null;
                  const rank = dateStr === todayDateStr ? 0 : dateStr === tomorrowDateStr ? 1 : 2;
                  const time = new Date(fd).getTime();
                  return { rank, time };
                })
                .filter((d): d is { rank: number; time: number } => d !== null)
                .sort((x, y) => x.rank !== y.rank ? x.rank - y.rank : x.time - y.time);
              return withRank.length > 0 ? withRank[0] : null;
            };
            const aVal = getClosestFollowUpRankAndTime(a);
            const bVal = getClosestFollowUpRankAndTime(b);
            if (aVal === null && bVal === null) return 0;
            if (aVal === null) return 1;
            if (bVal === null) return -1;
            return aVal.rank !== bVal.rank ? aVal.rank - bVal.rank : aVal.time - bVal.time;
          });
        }
        // For other filters, sort by customer creation date
        return filtered.sort((a, b) => {
          const aDate = new Date(a.customer.createdAt).getTime();
          const bDate = new Date(b.customer.createdAt).getTime();
          return bDate - aDate;
        });
      })()
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
        // For COMPLETED filter, sort by most recent completed job date (latest first)
        if (statusFilter === 'COMPLETED') {
          const aMostRecentCompleted = a.completedJobs.length > 0 
            ? getJobCompletionDate(a.completedJobs[0]) 
            : 0;
          const bMostRecentCompleted = b.completedJobs.length > 0 
            ? getJobCompletionDate(b.completedJobs[0]) 
            : 0;
          return bMostRecentCompleted - aMostRecentCompleted;
        }
        // For other filters, sort by customer creation date
        const aDate = new Date(a.customer.createdAt).getTime();
        const bDate = new Date(b.customer.createdAt).getTime();
        return bDate - aDate;
      });

  const shouldShowCompletedProfitSummary =
    statusFilter === 'COMPLETED' &&
    completedDatePreset === 'day' &&
    completedDateFilter === getTodayLocalDate() &&
    completedLeadTypeFilter === 'all' &&
    completedServiceSubTypeFilter === 'all' &&
    completedByFilter === 'all' &&
    !searchTerm.trim();

  const completedProfitSummary = shouldShowCompletedProfitSummary
    ? displayedCustomers
        .flatMap(({ completedJobs }) => completedJobs)
        .reduce(
          (totals, job) => {
            const financials = calculateCompletedJobProfit(job);
            totals.jobCount += 1;
            totals.revenue += financials.revenue;
            totals.sparePartsCost += financials.sparePartsCost;
            totals.leadCost += financials.leadCost;
            totals.commission += financials.commission;
            totals.profit += financials.profit;
            return totals;
          },
          {
            jobCount: 0,
            revenue: 0,
            sparePartsCost: 0,
            leadCost: 0,
            commission: 0,
            profit: 0,
          }
        )
    : null;

  const adminListData = useMemo(
    () => ({
      displayedCustomers,
      statusFilter,
      todayDateStr,
      tomorrowDateStr,
      followUpDateToStr,
      customerAMCStatus,
      customerPriorServiceStatus,
      isLoadingPhotos,
      selectedCustomerForPhotos,
      currentLocation,
      isGettingLocation,
      customerDistances,
      technicians,
      techniciansForReports,
      location,
      completedDatePreset,
      completedDateFilter,
      completedLeadTypeFilter,
      completedServiceSubTypeFilter,
      completedByFilter,
      loadedCompletedJobDetails,
      loadingCompletedJobDetails,
      highlightCompletedJobId,
      doesOngoingJobMatchFilters,
      getJobCompletionDate,
      applyListCustomerContactToCachedJob,
    }),
    [
      displayedCustomers,
      statusFilter,
      todayDateStr,
      tomorrowDateStr,
      followUpDateToStr,
      customerAMCStatus,
      customerPriorServiceStatus,
      isLoadingPhotos,
      selectedCustomerForPhotos,
      currentLocation,
      isGettingLocation,
      customerDistances,
      technicians,
      techniciansForReports,
      location,
      completedDatePreset,
      completedDateFilter,
      completedLeadTypeFilter,
      completedServiceSubTypeFilter,
      completedByFilter,
      loadedCompletedJobDetails,
      loadingCompletedJobDetails,
      highlightCompletedJobId,
      doesOngoingJobMatchFilters,
      getJobCompletionDate,
      applyListCustomerContactToCachedJob,
    ]
  );

  const adminListActionsRef = useRef<AdminDashboardListActions>({} as AdminDashboardListActions);
  adminListActionsRef.current = {
    moreOptionsCustomerId,
    setMoreOptionsCustomerId,
    handleEditCustomer,
    handleNewJob,
    handleViewPhotos,
    handleGenerateBill,
    handleGenerateQuotation,
    handleGenerateAMC,
    handleGenerateTaxInvoice,
    handleOpenCustomerReport,
    handleViewAMCInfo,
    setReminderEntity,
    setReminderContextLabel,
    openAdminModal,
    setViewRemindersCustomer,
    handlePhoneClick,
    handleWhatsAppClick,
    setCurrentLocation,
    setIsGettingLocation,
    setAddressDialogOpen,
    setAddressLocationVariant,
    hydrateCustomerForMaps,
    setSelectedCompletedJob,
    setCompletedJobEditData,
    setSelectedJobForMessage,
    sendCompletionEmailQuick,
    openCompletionEmailComposer,
    setSelectedBillPhotos,
    setSelectedPhoto,
    onAdminModalOpenChange,
    loadCompletedJobDetails,
    setSelectedJobDescription,
    setDescriptionDialogOpen,
    openPhotoGallery,
    handleAssignJob,
    handleCompleteJob,
    handleJobStatusUpdate,
    handleAddTeam,
    handleRemoveTeam,
    handleScheduleFollowUp,
    handleDenyJob,
    handleAssignFromFollowUp,
    handleMoveToOngoing,
    handleEditJob,
    handleReassignJob,
    handleUnassignJob,
    handleMeasureDistance,
    handleShareJobWhatsApp,
  };

  const filteredJobs = jobs.filter(job => {
    if (!searchTerm.trim()) return true; // Show all jobs if search is empty
    
    const searchLower = searchTerm.toLowerCase();
    const altPhone = job.customer?.alternate_phone || (job.customer as any)?.alternatePhone;
    const normSearch = normalizePhoneForSearch(searchTerm);
    const phoneMatch = normSearch.length >= 10 && (
      normalizePhoneForSearch(job.customer?.phone) === normSearch ||
      normalizePhoneForSearch(altPhone) === normSearch
    );
    return (
      (job.job_number || job.jobNumber)?.toLowerCase().includes(searchLower) ||
      (job.customer?.full_name || job.customer?.fullName)?.toLowerCase().includes(searchLower) ||
      job.customer?.phone?.includes(searchTerm) ||
      (altPhone != null && String(altPhone).includes(searchTerm)) ||
      phoneMatch
    );
  });

  // Filter jobs by today's date for stat cards
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const todayStart = today.toISOString();
  const todayEnd = tomorrow.toISOString();

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
  const completedJobsInSelectedWindow = completedFilterSourceJobs.length > 0
    ? completedFilterSourceJobs
    : completedJobs.filter((job) => {
        const completionDate = (job as any).completed_at || job.completedAt || (job as any).end_time || job.endTime;
        return isDateWithinCompletedRange(completedDateToStr(completionDate));
      });
  const MASTER_LEAD_TYPES = [
    'Website',
    'Direct call',
    'Google-Leads',
    'RO care india',
    'Home Triangle',
    'Home Triangle-Srujan',
    'Home Triangle-3',
    'Local Ramu',
    'Other'
  ];
  const MASTER_SERVICE_SUB_TYPES = [
    'Service',
    'Installation',
    'Reinstallation',
    'Return Complaint',
    'Return Service',
    'AMC Service',
    'New Purifier Installation',
    'Un-Installation',
    'Repair',
    'Maintenance',
    'Replacement',
    'Inspection',
    'Other'
  ];
  const dataLeadTypeOptions = completedJobsInSelectedWindow
    .map((job) => normalizeLeadType(findLeadSource(parseJobRequirements((job as any).requirements || job.requirements || [])) || 'Direct call'))
    .filter(Boolean);
  const completedLeadTypeOptions = Array.from(new Set([
    ...MASTER_LEAD_TYPES,
    ...dataLeadTypeOptions
  ])).sort((a, b) => a.localeCompare(b));
  const dataServiceSubTypeOptions = completedJobsInSelectedWindow
    .map((job) => normalizeServiceSubType((job as any).service_sub_type || job.serviceSubType || ''))
    .filter(Boolean);
  const completedServiceSubTypeOptions = Array.from(new Set([
    ...MASTER_SERVICE_SUB_TYPES,
    ...dataServiceSubTypeOptions
  ])).sort((a, b) => a.localeCompare(b));
  const completedByOptions = Array.from(new Set(
    technicians
      .map((tech) => (tech.fullName || '').trim())
      .filter(Boolean)
  )).sort((a, b) => a.localeCompare(b));
  const hasCompletedClientFilters =
    completedLeadTypeFilter !== 'all' ||
    completedServiceSubTypeFilter !== 'all' ||
    completedByFilter !== 'all';

  const handleSaveEditedCompletedJob = useCallback(async () => {
    await saveAdminCompletedJobEdit({
      selectedCompletedJob,
      completedJobEditData,
      statusFilter,
      currentPage,
      closeAdminModal,
      loadFilteredJobs,
      setLoadedCompletedJobDetails,
    });
  }, [
    selectedCompletedJob,
    completedJobEditData,
    statusFilter,
    currentPage,
    closeAdminModal,
    loadFilteredJobs,
  ]);
  
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

  const isDashboardBootstrapping =
    Boolean(user && isAdmin) && isInitialLoad;

  const isJobsListRefreshing = loading && !isInitialLoad;
  const listSyncActive = isJobsListRefreshing || isResumeListSyncing;
  const ongoingTabHasStaleJobs =
    statusFilter === 'ONGOING' && jobs.length > 0 && !jobsMatchOngoingTab(jobs);
  // Show loader only when there is nothing to display yet; cached Completed/Follow-up open instantly.
  const showJobsListLoader =
    listSyncActive &&
    displayedCustomers.length === 0 &&
    (statusFilter !== 'ONGOING' || ongoingTabHasStaleJobs);
  const jobsListRefreshLabel =
    statusFilter === 'RESCHEDULED'
      ? 'follow-up'
      : statusFilter === 'CANCELLED'
        ? 'denied'
        : statusFilter === 'COMPLETED'
          ? 'completed'
          : 'jobs';

  // Auth gate handled by AdminPortal — dashboard mounts only when user is admin
  if (isDashboardBootstrapping) {
    return <AdminScreenLoader message="Loading dashboard..." />;
  }

  // Show GST Invoices page if requested
  if (showGSTInvoicesPage) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AdminHeader />
        <div
          className={cn(
            'container mx-auto px-3 sm:px-4',
            gstInSubScreen ? 'py-2' : 'py-3 sm:py-5'
          )}
        >
          {!gstInSubScreen ? (
            <div className="mb-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleHideGSTInvoices}
                className="h-8 text-gray-600 hover:text-gray-900 -ml-2"
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back
              </Button>
            </div>
          ) : null}
          <Suspense fallback={<AdminScreenLoader message="Loading invoices..." />}>
            <GSTInvoicesPage onSubScreenChange={setGstInSubScreen} />
          </Suspense>
        </div>
      </div>
    );
  }

  // Show AMC View page if requested
  if (showAMCViewPage) {
    return (
      <Suspense fallback={<AdminScreenLoader message="Loading AMC..." />}>
        <AMCViewPage onBack={handleHideAMCView} onAMCDeleted={reloadAMCStatus} />
      </Suspense>
    );
  }

  // Show Letterhead Documents / Service Reports builder if requested
  if (showLetterheadDocsPage) {
    return (
      <Suspense fallback={<AdminScreenLoader message="Loading documents builder..." />}>
        <LetterheadDocumentsPage
          initialType={letterheadInitialType}
          onBack={() => navigate('/admin', { replace: true })}
        />
      </Suspense>
    );
  }

  if (currentView === 'payments') {
    return (
      <AdminTabViewShell loadingMessage="Loading payments..." onBack={() => handleViewChange('dashboard')}>
        <TechnicianPayments />
      </AdminTabViewShell>
    );
  }

  if (currentView === 'billing') {
    return (
      <AdminTabViewShell loadingMessage="Loading billing..." onBack={() => handleViewChange('dashboard')}>
        <BillingStats />
      </AdminTabViewShell>
    );
  }

  if (currentView === 'analytics') {
    return (
      <AdminTabViewShell loadingMessage="Loading analytics..." onBack={() => handleViewChange('dashboard')}>
        <Analytics />
      </AdminTabViewShell>
    );
  }

  if (currentView === 'inventory') {
    return (
      <AdminTabViewShell loadingMessage="Loading inventory..." onBack={() => handleViewChange('dashboard')}>
        <InventoryManagement />
      </AdminTabViewShell>
    );
  }


  return (
    <div className="min-h-screen bg-gray-50">
      <AdminHeader />
      
      <main className="container mx-auto px-4 py-4 sm:py-8">
        {isAdmin && (
          <WebsiteBookingIntentBanner
            playAlert={playNotificationSound}
            stopAlert={stopNotificationSound}
            onSearchCustomer={handleSearchFromBookingIntent}
          />
        )}
        <AdminDashboardHeader
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          onSearchPaste={handleSearchPaste}
          onSearchKeyPress={handleSearchKeyPress}
          onSearch={handleSearch}
          onClearSearch={handleClearSearch}
          isSearching={isSearching}
          onManualRefresh={() => void handleManualRefresh()}
          toolsMenuOpen={toolsMenuOpen}
          onToolsMenuOpenChange={setToolsMenuOpen}
          onOpenAdminTool={openAdminTool}
          onShowAmcView={handleShowAMCView}
          isManager={isManager}
          managerRestrictedTitle={managerRestrictedTitle}
          currentView={currentView}
          onViewChange={handleViewChange}
          onAddCustomer={handleAddCustomer}
        />

        {/* Stats Cards - Clickable Filter Buttons */}
        <StatsCards
          statusFilter={statusFilter}
          onFilterChange={(filter) => {
            switchJobTab(filter as AdminStatusFilter);
          }}
          jobCounts={jobCounts}
          pendingJobs={pendingJobs}
          inProgressJobs={inProgressJobs}
          allJobs={allFollowUpJobs}
        />

        {searchTerm.trim() && displayedCustomers.length > 0 && !showJobsListLoader && (
          <AdminSearchResultsBar
            searchTerm={searchTerm}
            resultCount={displayedCustomers.length}
            onClearSearch={handleClearSearch}
          />
        )}

        {statusFilter === 'CANCELLED' && (
          <DeniedJobsDateFilter
            value={deniedDateFilter}
            onChange={(v) => setDeniedDateFilter(v)}
            onToday={() => setDeniedDateFilter(getTodayLocalDate())}
          />
        )}

        {statusFilter === 'COMPLETED' && (
          <CompletedJobsFiltersSection
            completedDatePreset={completedDatePreset}
            completedDateFilter={completedDateFilter}
            onPickDay={(next) => {
              setCompletedDatePreset('day');
              setCompletedDateFilter(next);
              setCompletedRangeStartDate(next);
              setCompletedRangeEndDate(next);
              setCompletedLeadTypeFilter('all');
              setCompletedServiceSubTypeFilter('all');
              setCompletedByFilter('all');
            }}
            onQuickToday={() => {
              const today = getTodayLocalDate();
              setCompletedDatePreset('day');
              setCompletedDateFilter(today);
              setCompletedRangeStartDate(today);
              setCompletedRangeEndDate(today);
              setCompletedLeadTypeFilter('all');
              setCompletedServiceSubTypeFilter('all');
              setCompletedByFilter('all');
            }}
            onSwitchToSingleDay={() => {
              const today = getTodayLocalDate();
              setCompletedDatePreset('day');
              setCompletedDateFilter(today);
              setCompletedRangeStartDate(today);
              setCompletedRangeEndDate(today);
              setCompletedLeadTypeFilter('all');
              setCompletedServiceSubTypeFilter('all');
              setCompletedByFilter('all');
            }}
            onOpenFilters={() => openAdminModal('completed-filters')}
            dialogOpen={completedFilterDialogOpen}
            onDialogOpenChange={(open) => {
              if (open) openAdminModal('completed-filters');
              else {
                setCompletedFilterDialogOpen(false);
                onAdminModalOpenChange('completed-filters', false);
              }
            }}
            draftDatePreset={draftCompletedDatePreset}
            onDraftDatePresetChange={setDraftCompletedDatePreset}
            draftDateFilter={draftCompletedDateFilter}
            onDraftDateFilterChange={setDraftCompletedDateFilter}
            draftRangeStartDate={draftCompletedRangeStartDate}
            onDraftRangeStartDateChange={setDraftCompletedRangeStartDate}
            draftRangeEndDate={draftCompletedRangeEndDate}
            onDraftRangeEndDateChange={setDraftCompletedRangeEndDate}
            draftLeadTypeFilter={draftCompletedLeadTypeFilter}
            onDraftLeadTypeFilterChange={setDraftCompletedLeadTypeFilter}
            draftServiceSubTypeFilter={draftCompletedServiceSubTypeFilter}
            onDraftServiceSubTypeFilterChange={setDraftCompletedServiceSubTypeFilter}
            draftCompletedByFilter={draftCompletedByFilter}
            onDraftCompletedByFilterChange={setDraftCompletedByFilter}
            leadTypeOptions={completedLeadTypeOptions}
            serviceSubTypeOptions={completedServiceSubTypeOptions}
            completedByOptions={completedByOptions}
            onResetFilters={() => {
              const today = getTodayLocalDate();
              setCompletedDatePreset('day');
              setCompletedDateFilter(today);
              setCompletedRangeStartDate(today);
              setCompletedRangeEndDate(today);
              setCompletedLeadTypeFilter('all');
              setCompletedServiceSubTypeFilter('all');
              setCompletedByFilter('all');
              setDraftCompletedDatePreset('day');
              setDraftCompletedDateFilter(today);
              setDraftCompletedRangeStartDate(today);
              setDraftCompletedRangeEndDate(today);
              setDraftCompletedLeadTypeFilter('all');
              setDraftCompletedServiceSubTypeFilter('all');
              setDraftCompletedByFilter('all');
            }}
            onApplyFilters={() => {
              setCompletedDatePreset(draftCompletedDatePreset);
              setCompletedDateFilter(draftCompletedDateFilter);
              setCompletedRangeStartDate(draftCompletedRangeStartDate);
              setCompletedRangeEndDate(draftCompletedRangeEndDate);
              setCompletedLeadTypeFilter(draftCompletedLeadTypeFilter);
              setCompletedServiceSubTypeFilter(draftCompletedServiceSubTypeFilter);
              setCompletedByFilter(draftCompletedByFilter);
              closeAdminModal();
            }}
          />
        )}

        {/* Customers with Jobs */}
        <div className="mb-6 pb-2 sm:pb-0">
          {!searchTerm.trim() && (
          <div className={`flex items-center justify-between flex-wrap gap-2 ${statusFilter === 'ONGOING' ? 'mb-3 sm:mb-1' : 'mb-1'}`}>
            <h2 className="text-lg sm:text-xl font-bold text-gray-900">
              {statusFilter === 'ALL' ? 'All Customers' :
               statusFilter === 'ONGOING' ? 'Customers with Ongoing Jobs' : 
               statusFilter === 'RESCHEDULED' ? 'Customers with Follow-up Jobs' :
               statusFilter === 'CANCELLED' ? 'Customers with Denied Jobs' :
               statusFilter === 'COMPLETED' ? 'Customers with Completed Jobs' :
               `Customers with ${statusFilter} Jobs`}
            </h2>

            {statusFilter === 'ONGOING' && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  if (hasOngoingClientFilters) {
                    clearOngoingFilters();
                    return;
                  }
                  openAdminModal('ongoing-filters');
                }}
                className="flex items-center gap-2 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2 whitespace-nowrap"
                title={hasOngoingClientFilters ? 'Clear ongoing filters' : 'Filter ongoing jobs'}
                aria-label={hasOngoingClientFilters ? 'Clear ongoing filters' : 'Filter ongoing jobs'}
              >
                {hasOngoingClientFilters ? (
                  <FilterX className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                ) : (
                  <Filter className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                )}
                <span className="hidden sm:inline">{hasOngoingClientFilters ? 'Clear' : 'Filter'}</span>
              </Button>
            )}
            
            {/* Show all followups button */}
            {statusFilter === 'RESCHEDULED' && (() => {
              // Calculate total customers with followups (all dates)
              const allCustomersWithFollowups = customersWithJobs.filter(({ allJobs }) => 
                allJobs.some(job => ['FOLLOW_UP', 'RESCHEDULED'].includes(job.status))
              );
              
              // Calculate customers with followups beyond 7 days
              const now = new Date();
              const weekFromNow = new Date(now);
              weekFromNow.setDate(weekFromNow.getDate() + 7);
              
              const customersBeyondWeek = allCustomersWithFollowups.filter(({ allJobs }) => {
                const followUpJobs = allJobs.filter(job => ['FOLLOW_UP', 'RESCHEDULED'].includes(job.status));
                // Check if customer has ONLY followups beyond 7 days (no followups within 7 days)
                const hasWithinWeek = followUpJobs.some((job: any) => {
                  const followUpDate = job.follow_up_date || job.followUpDate;
                  if (!followUpDate) return false;
                  const followUpDateObj = new Date(followUpDate);
                  if (isNaN(followUpDateObj.getTime())) return false;
                  return followUpDateObj <= weekFromNow;
                });
                return !hasWithinWeek; // Only show if no followups within week
              });
              
              const hiddenCount = customersBeyondWeek.length;
              
              if (hiddenCount === 0) return null;
              
              return (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAllFollowups(!showAllFollowups)}
                  className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2 whitespace-nowrap"
                >
                  {showAllFollowups ? (
                    <>
                      <ChevronUp className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                      <span className="hidden sm:inline">Hide older followups</span>
                      <span className="sm:hidden">Hide ({hiddenCount})</span>
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                      <span className="hidden sm:inline">Show all followups ({hiddenCount} more)</span>
                      <span className="sm:hidden">Show all ({hiddenCount})</span>
                    </>
                  )}
                </Button>
              );
            })()}
          </div>
          )}
          {!searchTerm.trim() && (
            <p className={`text-xs text-gray-500 mb-3 ${statusFilter === 'ONGOING' ? 'hidden sm:block' : ''}`}>
              {statusFilter === 'ALL'
                ? `Showing all ${displayedCustomers.length} customers (including those with no jobs)`
                : statusFilter === 'ONGOING' 
                ? `Showing ${displayedCustomers.length} customers with ongoing jobs (pending, assigned, in-progress)`                                           
                : statusFilter === 'RESCHEDULED'
                ? `Showing ${displayedCustomers.length} customers with follow-up jobs`                                                                          
                : statusFilter === 'CANCELLED'
                ? (() => {
                    const pageInfo = totalPages > 1 ? ` (page ${currentPage}/${totalPages}, ${totalCount} total jobs)` : '';
                    return `Showing ${displayedCustomers.length} customer${displayedCustomers.length !== 1 ? 's' : ''} with denied jobs for ${new Date(deniedDateFilter).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}${pageInfo}`;
                  })()                                                                             
                : statusFilter === 'COMPLETED'
                ? (() => {
                    const pageInfo = !hasCompletedClientFilters && totalPages > 1 ? ` (page ${currentPage}/${totalPages}, ${totalCount} total jobs)` : '';
                    if (completedDatePreset === 'day') {
                      return `Customers with completed jobs for ${new Date(completedDateFilter).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}${pageInfo}`;
                    }
                    return `Customers with completed jobs from ${new Date(completedRangeStartDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} to ${new Date(completedRangeEndDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}${pageInfo}`;
                  })()                                                                             
                : `Showing ${displayedCustomers.length} customers with ${statusFilter.toLowerCase().replace('_', ' ')} jobs`                                    
              }
            </p>
          )}

          {statusFilter === 'ONGOING' && ongoingFilterDialogOpen && (
            <OngoingJobsFiltersDialog
              open={ongoingFilterDialogOpen}
              onOpenChange={(open) => {
                if (open) openAdminModal('ongoing-filters');
                else {
                  setOngoingFilterDialogOpen(false);
                  onAdminModalOpenChange('ongoing-filters', false);
                }
              }}
              draftAssignmentFilter={draftOngoingAssignmentFilter}
              onDraftAssignmentFilterChange={setDraftOngoingAssignmentFilter}
              draftAssignedTechnicianFilter={draftOngoingAssignedTechnicianFilter}
              onDraftAssignedTechnicianFilterChange={setDraftOngoingAssignedTechnicianFilter}
              draftServiceSubTypeFilter={draftOngoingServiceSubTypeFilter}
              onDraftServiceSubTypeFilterChange={setDraftOngoingServiceSubTypeFilter}
              technicians={technicians}
              serviceSubTypeOptions={ongoingServiceSubTypeOptions}
              onReset={() => {
                setOngoingAssignmentFilter('all');
                setOngoingAssignedTechnicianFilter('all');
                setOngoingServiceSubTypeFilter('all');
                setDraftOngoingAssignmentFilter('all');
                setDraftOngoingAssignedTechnicianFilter('all');
                setDraftOngoingServiceSubTypeFilter('all');
              }}
              onApply={() => {
                setOngoingAssignmentFilter(draftOngoingAssignmentFilter);
                setOngoingAssignedTechnicianFilter(draftOngoingAssignedTechnicianFilter);
                setOngoingServiceSubTypeFilter(draftOngoingServiceSubTypeFilter);
                closeAdminModal();
              }}
            />
          )}
          
          {/* Customer Cards with Jobs */}
          <div className="space-y-6" data-admin-customer-list>
            {showJobsListLoader ? (
              <AdminInlineLoader message={`Loading ${jobsListRefreshLabel} jobs...`} />
            ) : displayedCustomers.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/50 px-4 py-12 text-center">
                {searchTerm.trim() ? (
                  <>
                    <p className="text-sm text-gray-600">
                      No customers found for <span className="font-medium">"{searchTerm}"</span>
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={handleClearSearch}
                    >
                      Clear search
                    </Button>
                  </>
                ) : statusFilter === 'ONGOING' ? (
                  <p className="text-sm text-gray-600">No ongoing jobs right now.</p>
                ) : statusFilter === 'COMPLETED' ? (
                  <p className="text-sm text-gray-600">No completed jobs for the selected date or filters.</p>
                ) : statusFilter === 'RESCHEDULED' ? (
                  <p className="text-sm text-gray-600">No follow-up jobs scheduled.</p>
                ) : statusFilter === 'CANCELLED' ? (
                  <p className="text-sm text-gray-600">No denied jobs for the selected date.</p>
                ) : (
                  <p className="text-sm text-gray-600">No jobs to show for this filter.</p>
                )}
              </div>
            ) : (
              <AdminDashboardListProvider data={adminListData} actionsRef={adminListActionsRef}>
                <AdminCustomerJobsList />
              </AdminDashboardListProvider>
            )}
          </div>

          {completedProfitSummary && completedProfitSummary.jobCount > 0 && (
            <div className="mt-6 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-gray-800">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="font-semibold text-green-900">
                    Profit of Day
                  </div>
                  <div className="text-xs text-gray-600">
                    Amount - spare parts - lead cost - technician commission
                  </div>
                </div>
                <div className={completedProfitSummary.profit >= 0 ? 'text-lg font-bold text-green-700' : 'text-lg font-bold text-red-600'}>
                  ₹{completedProfitSummary.profit.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
              <div className="mt-2 text-xs text-gray-600">
                Amount ₹{completedProfitSummary.revenue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                {' '}− spare parts ₹{completedProfitSummary.sparePartsCost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                {' '}− lead ₹{completedProfitSummary.leadCost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                {' '}− commission ₹{completedProfitSummary.commission.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          )}
          
          {/* Pagination — compact, wraps on small screens (no horizontal scroll) */}
          {(statusFilter === 'CANCELLED' || statusFilter === 'RESCHEDULED' || statusFilter === 'COMPLETED') && totalPages > 1 && (
            <div className="mt-6 w-full min-w-0 max-w-full px-1">
              <div className="flex flex-col items-center gap-2">
                <div className="flex flex-wrap items-center justify-center gap-2 w-full max-w-full">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 shrink-0 touch-manipulation"
                    disabled={currentPage <= 1}
                    onClick={() => currentPage > 1 && setCurrentPage(currentPage - 1)}
                  >
                    <ArrowLeft className="h-4 w-4 sm:mr-1" />
                    <span className="hidden sm:inline">Previous</span>
                  </Button>
                  <span className="text-sm text-gray-700 dark:text-gray-300 tabular-nums px-2 text-center min-w-[5.5rem]">
                    {currentPage} / {totalPages}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 shrink-0 touch-manipulation"
                    disabled={currentPage >= totalPages}
                    onClick={() => currentPage < totalPages && setCurrentPage(currentPage + 1)}
                  >
                    <span className="hidden sm:inline">Next</span>
                    <ArrowRight className="h-4 w-4 sm:ml-1" />
                  </Button>
                </div>
                {statusFilter !== 'COMPLETED' && (
                  <p className="text-xs text-gray-500 text-center w-full">
                    {totalCount} total jobs
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

      </main>

      {/* Add Customer Dialog */}
      <AddCustomerDialog
        open={addDialogOpen}
        onOpenChange={bindAdminModalDismiss('add-customer', () => setAddDialogOpen(false))}
        customers={customers}
        onCustomerCreated={async (newCustomer) => {
          if (newCustomer) {
            const transformed = transformCustomerData(newCustomer);
            pendingNewCustomersRef.current.set(transformed.id, transformed);
          }
          // Light refresh only: full loadDashboardData pulled technicians, AMC, brands, follow-ups — slow and unnecessary here.
          await Promise.all([
            loadFilteredJobs(statusFilter, currentPage, { silent: true }),
            loadJobCounts(),
          ]);
        }}
        onJobAssignedToTechnician={(payload) => {
          const assignedTechnician = technicians.find((t) => t.id === payload.technicianId);
          if (!assignedTechnician?.phone) return;
          scrollPositionBeforeWhatsAppRef.current = window.scrollY;
          const vis = payload.visibleAddress;
          const addr = payload.address;
          const locationText =
            vis && String(vis).trim()
              ? String(vis).trim()
              : addr?.area || addr?.city || '';
          setWhatsappTechnician({
            name: assignedTechnician.fullName || (assignedTechnician as { full_name?: string }).full_name || 'Technician',
            phone: assignedTechnician.phone,
          });
          setWhatsappServiceSubType(payload.serviceSubType);
          setWhatsappCustomerName(payload.customerName);
          setWhatsappLocation(locationText || '');
          setWhatsappLeadSource(payload.leadSource || '');
          setWhatsappCustomTime(payload.customTime || '');
          setWhatsappDialogOpen(true);
          openAdminWhatsappModal();
        }}
        onCheckExistingCustomer={checkExistingCustomer}
        onExistingCustomerFound={(customer) => {
          setExistingCustomer(customer);
          setOverrideDialogOpen(true);
        }}
      />

      <AdminOverrideExistingCustomerDialog
        open={overrideDialogOpen}
        onOpenChange={setOverrideDialogOpen}
        existingCustomer={existingCustomer}
        onCancel={() => {
          handleCancelOverride();
          closeAdminModal();
        }}
        onConfirmUpdate={() => {
          setShouldUpdateExisting(true);
          setOverrideDialogOpen(false);
          setCurrentStep(2);
        }}
      />

      {/* Legacy Add Customer Dialog - REMOVED - Now using AddCustomerDialog component */}


      {/* Edit Customer Dialog */}
      <EditCustomerDialog
        open={editDialogOpen}
        onOpenChange={bindAdminModalDismiss('edit-customer', () => {
          setEditDialogOpen(false);
          setEditingCustomer(null);
        })}
        customer={editingCustomer}
        dbBrands={dbBrands}
        dbModels={dbModels}
        onCustomerUpdated={(updatedCustomer) => {
          setCustomers(customers.map(c => c.id === updatedCustomer.id ? updatedCustomer : c));
          patchCustomerContactOnJobs(updatedCustomer.id, {
            email: updatedCustomer.email ?? null,
            phone: updatedCustomer.phone ?? null,
            alternate_phone:
              (updatedCustomer as any).alternate_phone ?? updatedCustomer.alternatePhone ?? null,
            full_name: (updatedCustomer as any).full_name ?? updatedCustomer.fullName ?? null,
          });
          setEditingCustomer(null);
          closeAdminModal();
          void loadFilteredJobs(statusFilter, currentPage, { silent: true });
        }}
        onLoadBrandsAndModels={loadBrandsAndModels}
        onCustomerDeleted={(customerId) => {
          setCustomers(customers.filter(c => c.id !== customerId));
          setEditingCustomer(null);
          loadDashboardData();
        }}
      />

      {/* Legacy Edit Customer Dialog - REMOVED */}

      {/* Delete Customer / Job / Photo confirmation dialogs */}
      <AdminDeleteConfirmDialogs
        deleteCustomerOpen={deleteDialogOpen}
        onDeleteCustomerOpenChange={setDeleteDialogOpen}
        customerToDelete={customerToDelete}
        onConfirmDeleteCustomer={handleDeleteCustomer}
        deleteJobOpen={deleteJobDialogOpen}
        onDeleteJobOpenChange={bindAdminModalDismiss('delete-job', () => {
          setDeleteJobDialogOpen(false);
          setJobToDelete(null);
        })}
        jobToDelete={jobToDelete}
        onConfirmDeleteJob={handleDeleteJob}
        deletePhotoOpen={deletePhotoDialogOpen}
        onDeletePhotoOpenChange={setDeletePhotoDialogOpen}
        isDeletingPhoto={isDeletingPhoto}
        onConfirmDeletePhoto={confirmDeletePhoto}
        deleteCustomerPhotoOpen={deleteCustomerPhotoDialogOpen}
        onDeleteCustomerPhotoOpenChange={setDeleteCustomerPhotoDialogOpen}
        isDeletingCustomerPhoto={isDeletingCustomerPhoto}
        onConfirmDeleteCustomerPhoto={confirmDeleteCustomerPhoto}
      />

      {/* Photo Gallery Dialog */}
      <PhotoGalleryDialog
        open={photoGalleryOpen}
        onOpenChange={bindAdminModalDismiss('photos', () => setPhotoGalleryOpen(false))}
        selectedJobPhotos={selectedJobPhotos}
        onViewPhoto={openPhotoViewer}
        onDeletePhoto={handleDeletePhoto}
      />

      {/* Full-Screen Photo Viewer Modal */}
      <PhotoViewerDialog
        open={photoViewerOpen}
        onOpenChange={bindAdminModalDismiss('photo-viewer', () => {
          setPhotoViewerOpen(false);
          setSelectedPhoto(null);
          setSelectedBillPhotos(null);
          setSelectedCustomerPhotos(null);
          setPhotoDownloadMeta(null);
        })}
        selectedPhoto={selectedPhoto}
        selectedBillPhotos={selectedBillPhotos}
        selectedJobPhotos={selectedJobPhotos}
        onPrevious={goToPreviousPhoto}
        onNext={goToNextPhoto}
        onDownload={downloadPhoto}
        onClose={() => {
          onAdminModalOpenChange('photo-viewer', false);
          setSelectedPhoto(null);
          setSelectedBillPhotos(null);
          setSelectedCustomerPhotos(null);
          setPhotoDownloadMeta(null);
        }}
      />


      {/* Job Assignment Dialog */}
      <AssignJobDialog
        open={assignJobDialogOpen}
        onOpenChange={bindAdminModalDismiss('assign', () => {
          setAssignJobDialogOpen(false);
          setJobToAssign(null);
          setSelectedTechnicianId('');
        })}
        job={jobToAssign}
        technicians={technicians}
        techniciansRefreshing={assignTechniciansRefreshing}
        selectedTechnicianId={selectedTechnicianId}
        onTechnicianSelect={setSelectedTechnicianId}
        onReloadTechnicians={reloadTechnicians}
        onSave={handleSaveJobAssignment}
        onCancel={() => {
          setAssignJobDialogOpen(false);
          setJobToAssign(null);
          setSelectedTechnicianId('');
          onAdminModalOpenChange('assign', false);
        }}
      />

      {/* Add Team Dialog */}
      <AddTeamDialog
        open={addTeamDialogOpen}
        onOpenChange={setAddTeamDialogOpen}
        job={jobForTeam}
        technicians={technicians}
        selectedTeamMemberId={selectedTeamMemberId}
        onTeamMemberSelect={setSelectedTeamMemberId}
        onReloadTechnicians={reloadTechnicians}
        onSave={handleSaveTeamMember}
        onCancel={() => {
          setAddTeamDialogOpen(false);
          setJobForTeam(null);
          setSelectedTeamMemberId('');
        }}
      />

      {/* Remove Team Dialog */}
      <RemoveTeamDialog
        open={removeTeamDialogOpen}
        onOpenChange={setRemoveTeamDialogOpen}
        job={jobForRemoveTeam}
        technicians={technicians}
        selectedTeamMemberId={selectedTeamMemberToRemove}
        onTeamMemberSelect={setSelectedTeamMemberToRemove}
        onSave={handleSaveTeamMemberRemoval}
        onCancel={() => {
          setRemoveTeamDialogOpen(false);
          setJobForRemoveTeam(null);
          setSelectedTeamMemberToRemove('');
        }}
      />

      {/* New Job Dialog */}
      <NewJobDialog
        open={newJobDialogOpen}
        onOpenChange={bindAdminModalDismiss('new-job', () => {
          setNewJobDialogOpen(false);
          setIsJobDialogReady(false);
          setSelectedCustomerForJob(null);
        })}
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
        onJobAssignedToTechnician={(payload) => {
          const assignedTechnician = technicians.find((t) => t.id === payload.technicianId);
          if (!assignedTechnician?.phone) return;
          scrollPositionBeforeWhatsAppRef.current = window.scrollY;
          const vis = payload.visibleAddress;
          const addr = payload.address;
          const locationText =
            vis && String(vis).trim()
              ? String(vis).trim()
              : addr?.area || addr?.city || '';
          setWhatsappTechnician({
            name:
              assignedTechnician.fullName ||
              (assignedTechnician as { full_name?: string }).full_name ||
              'Technician',
            phone: assignedTechnician.phone,
          });
          setWhatsappServiceSubType(payload.serviceSubType);
          setWhatsappCustomerName(payload.customerName);
          setWhatsappLocation(locationText || '');
          setWhatsappLeadSource(payload.leadSource || '');
          setWhatsappCustomTime(payload.customTime || '');
          setWhatsappDialogOpen(true);
          openAdminWhatsappModal();
        }}
      />

      {/* Customer Photo Gallery Dialog */}
      <CustomerPhotoGalleryDialog
        open={customerPhotoGalleryOpen}
        onOpenChange={(open) => {
          if (!open) handleClosePhotoGallery();
        }}
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
          const customerId = selectedCustomerForPhotos?.customer_id || selectedCustomerForPhotos?.customerId || '';
          const photos = customerPhotos[customerId] || [];
          // Reverse photos to match the display order (latest first)
          const reversedPhotos = [...photos].reverse();
          setSelectedCustomerPhotos(reversedPhotos);
          setSelectedPhoto({ url: photo, index, total });
          openAdminModal('photo-viewer', {
            customerId: selectedCustomerForPhotos?.id,
            photoIdx: index,
          });
        }}
        onDeletePhoto={(photoUrl, photoIndex) => {
          setCustomerPhotoToDelete({ photoUrl, photoIndex });
          setDeleteCustomerPhotoDialogOpen(true);
        }}
      />

      {/* Service History Dialog */}
      <ServiceHistoryDialog
        open={historyDialogOpen}
        onOpenChange={bindAdminModalDismiss('history', () => setHistoryDialogOpen(false))}
        customer={selectedCustomerForHistory}
        history={selectedCustomerForHistory ? (customerHistory[selectedCustomerForHistory.customer_id || selectedCustomerForHistory.customerId || ''] || []) : []}
        hasMore={historyHasMore}
        loadingMore={historyLoadingMore}
        onLoadMore={loadMoreCustomerHistory}
      />

      {/* Legacy Service History Dialog - REMOVED - Now using ServiceHistoryDialog component */}

      {/* Phone Numbers Popup */}
      <PhoneNumbersDialog
        open={phonePopupOpen}
        onOpenChange={setPhonePopupOpen}
        customer={selectedCustomerPhone}
      />

      {/* WhatsApp Numbers Popup */}
      <PhoneNumbersDialog
        open={whatsappPopupOpen}
        onOpenChange={setWhatsappPopupOpen}
        customer={selectedCustomerWhatsApp}
        mode="whatsapp"
      />

      {/* Reassign Job Dialog */}
      <ReassignJobDialog
        open={reassignDialogOpen}
        onOpenChange={bindAdminModalDismiss('reassign', () => {
          setReassignDialogOpen(false);
          setJobToReassign(null);
          setSelectedTechnicianForReassign('');
        })}
        job={jobToReassign}
        technicians={technicians}
        techniciansRefreshing={reassignTechniciansRefreshing}
        selectedTechnicianId={selectedTechnicianForReassign}
        onTechnicianSelect={setSelectedTechnicianForReassign}
        onReloadTechnicians={reloadTechnicians}
        onSave={handleReassignSubmit}
        onCancel={() => {
          setReassignDialogOpen(false);
          setJobToReassign(null);
          setSelectedTechnicianForReassign('');
          onAdminModalOpenChange('reassign', false);
        }}
      />
      
      {/* Legacy Reassign Job Dialog - REMOVED - Now using ReassignJobDialog component */}

      {/* Edit Job Dialog */}
      <EditJobDialog
        open={editJobDialogOpen}
        onOpenChange={bindAdminModalDismiss('edit-job', () => {
          setEditJobDialogOpen(false);
          setJobToEdit(null);
        })}
        job={jobToEdit}
        onJobUpdated={(updatedJob) => {
          if (!updatedJob?.id) {
            setJobToEdit(null);
            return;
          }
          setJobs(prev => prev.map(j => {
            if (j.id !== updatedJob.id) return j;
            return { ...j, ...updatedJob };
          }));
          const customerId =
            (updatedJob as any).customer_id ??
            (jobToEdit as any)?.customer_id ??
            (jobToEdit as any)?.customerId ??
            (jobToEdit as any)?.customer?.id;
          if (customerId) {
            setCustomerJobs(prev => ({
              ...prev,
              [customerId]: (prev[customerId] || []).map(j => j.id === updatedJob.id ? { ...j, ...updatedJob } : j),
            }));
          }
          setJobToEdit(null);
        }}
      />

      {/* Bill Generation Modal — code-split, only mounted while open */}
      {billModalOpen && (
        <Suspense fallback={null}>
          <BillModal
            isOpen={billModalOpen}
            onClose={handleBillModalClose}
            customer={selectedCustomerForBill}
          />
        </Suspense>
      )}

      {/* Quotation Generation Modal */}
      {quotationModalOpen && (
        <Suspense fallback={null}>
          <QuotationModal
            isOpen={quotationModalOpen}
            onClose={handleQuotationModalClose}
            customer={selectedCustomerForQuotation}
          />
        </Suspense>
      )}

      {/* AMC Generation Modal */}
      {amcModalOpen && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="flex items-center gap-3 rounded-lg bg-white px-5 py-4 shadow-lg text-sm text-slate-700">
                <RefreshCw className="w-5 h-5 animate-spin text-violet-600" />
                Opening AMC…
              </div>
            </div>
          }
        >
          <AMCModal
            isOpen={amcModalOpen}
            onClose={handleAMCModalClose}
            customer={selectedCustomerForAMC}
            onAMCSaved={reloadAMCStatus}
          />
        </Suspense>
      )}

      {/* Tax Invoice Generation Modal */}
      {taxInvoiceModalOpen && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="flex items-center gap-3 rounded-lg bg-white px-5 py-4 shadow-lg text-sm text-slate-700">
                <RefreshCw className="w-5 h-5 animate-spin text-blue-600" />
                Opening tax invoice…
              </div>
            </div>
          }
        >
          <TaxInvoiceModal
            isOpen={taxInvoiceModalOpen}
            onClose={handleTaxInvoiceModalClose}
            customer={selectedCustomerForTaxInvoice}
          />
        </Suspense>
      )}

      {/* AMC Info Dialog */}
      <AmcInfoDialog
        open={amcInfoDialogOpen}
        onOpenChange={setAmcInfoDialogOpen}
        customer={selectedCustomerForAMC}
        amcInfo={amcInfo}
        loading={loadingAMCInfo}
        onClose={() => {
          setAmcInfoDialogOpen(false);
          setSelectedCustomerForAMC(null);
          setAmcInfo(null);
        }}
        onEdit={() => {
          setAmcInfoDialogOpen(false);
          setAmcEditDialogOpen(true);
        }}
      />

      {/* Edit AMC Dialog (opens from inside AMC Info) */}
      <EditAMCDialog
        open={amcEditDialogOpen}
        onOpenChange={(open) => {
          setAmcEditDialogOpen(open);
          if (!open && !amcInfoDialogOpen) {
            setSelectedCustomerForAMC(null);
          }
        }}
        amcContract={amcInfo}
        technicians={technicians as any}
        onSaved={(updated) => {
          if (updated) setAmcInfo(updated);
          void reloadAMCStatus();
        }}
      />

      {/* Follow-up Modal */}
        <FollowUpModal
          isOpen={followUpModalOpen}
          onClose={() => {
            setFollowUpModalOpen(false);
            setSelectedJobForFollowUp(null);
            closeAdminModal();
          }}
          job={selectedJobForFollowUp}
          onScheduleFollowUp={handleFollowUpSubmit}
        />

        {/* Move to Ongoing Dialog */}
        <MoveToOngoingDialog
          open={moveToOngoingDialogOpen}
          onOpenChange={bindAdminModalDismiss('move-ongoing', () => {
            setMoveToOngoingDialogOpen(false);
            setSelectedJobForMoveToOngoing(null);
            setMoveToOngoingDate('');
            setMoveToOngoingTimeSlot('MORNING');
            setMoveToOngoingCustomTime('');
          })}
          date={moveToOngoingDate}
          onDateChange={setMoveToOngoingDate}
          timeSlot={moveToOngoingTimeSlot}
          onTimeSlotChange={setMoveToOngoingTimeSlot}
          customTime={moveToOngoingCustomTime}
          onCustomTimeChange={setMoveToOngoingCustomTime}
          isUpdating={isUpdating}
          onCancel={() => {
            setMoveToOngoingDialogOpen(false);
            setSelectedJobForMoveToOngoing(null);
            setMoveToOngoingDate('');
            setMoveToOngoingTimeSlot('MORNING');
            setMoveToOngoingCustomTime('');
            onAdminModalOpenChange('move-ongoing', false);
          }}
          onSubmit={performMoveToOngoing}
        />

      {/* Deny Job Dialog */}
      <DenyJobDialog
        open={denyDialogOpen}
        onOpenChange={bindAdminModalDismiss('deny', () => {
          setDenyDialogOpen(false);
          setSelectedJobForDeny(null);
          setDenyReason('');
        })}
        job={selectedJobForDeny}
        denyReason={denyReason}
        onDenyReasonChange={setDenyReason}
        onDeny={handleDenyJobSubmit}
      />

      {/* Technician Selection Dialog for Job Completion */}
      <CompleteTechnicianSelectDialog
        open={technicianSelectDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            if (suppressCompleteFlowRevertRef.current) {
              suppressCompleteFlowRevertRef.current = false;
            } else {
              void revertIncompleteCompleteFlow();
              setSelectedJobForComplete(null);
              setSelectedTechnicianForComplete('');
            }
            if (parseAdminDashboardUrl(location.search).modal === 'complete') {
              closeAdminModal();
            }
          }
          setTechnicianSelectDialogOpen(open);
        }}
        job={selectedJobForComplete}
        technicians={technicians}
        selectedTechnicianId={selectedTechnicianForComplete}
        onSelectedTechnicianChange={setSelectedTechnicianForComplete}
        onContinue={handleTechnicianSelectedForComplete}
      />

      {/* Complete Job Dialog */}
      <CompleteJobDialog
        open={completeDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeAdminModal();
            setCompleteDialogOpen(false);
            void revertIncompleteCompleteFlow();
            setSelectedJobForComplete(null);
            setSelectedTechnicianForComplete('');
          } else {
            setCompleteDialogOpen(true);
          }
        }}
        job={selectedJobForComplete}
        technicians={technicians}
        commonQrCodes={commonQrCodes}
        onLoadQrCodes={loadQrCodes}
        selectedTechnicianId={selectedTechnicianForComplete}
        onJobCompleted={async (completedJobId?: string) => {
          clearCompleteFlowSnapshot();
          // Mark this job as completed by admin so polling handler doesn't play sound for it
          if (completedJobId) {
            jobIdsCompletedByAdminRef.current.add(completedJobId);
            setTimeout(() => {
              jobIdsCompletedByAdminRef.current.delete(completedJobId);
            }, 5000);
            // Flip returning-customer map so the blue indicator updates without waiting for refresh.
            const completedJob = jobs.find((j) => j.id === completedJobId);
            const completedCustomerId =
              (completedJob as any)?.customer_id ||
              (completedJob as any)?.customerId ||
              ((completedJob as any)?.customer && (completedJob as any).customer.id);
            if (completedCustomerId) {
              const serviceDate = new Date().toISOString().split('T')[0];
              setCustomerPriorServiceStatus((prev) => ({ ...prev, [completedCustomerId]: true }));
              setCustomers((prev) =>
                prev.map((c) =>
                  c.id === completedCustomerId
                    ? { ...c, lastServiceDate: c.lastServiceDate || serviceDate }
                    : c
                )
              );
              void db.customers.update(completedCustomerId, { last_service_date: serviceDate });
            }
          }
          await invalidateAdminDashboardCaches();
          await reloadCustomerPriorServiceStatus();
          await loadFilteredJobs(statusFilter, currentPage);
          setSelectedTechnicianForComplete('');
        }}
      />
      
      {/* Complete Job Dialog - Now handled by CompleteJobDialog component */}
      {/* Address Dialog */}
      <AddressDialog
        open={addressDialogOpen}
        onOpenChange={setAddressDialogOpen}
        locationVariantByCustomerId={addressLocationVariant}
        customers={baseCustomers}
        currentLocation={currentLocation}
        customerDistances={customerDistances}
        onCalculateDistance={async (customer, destination) => {
          if (calculateDistanceAndTimeRef.current && currentLocation) {
            await calculateDistanceAndTimeRef.current(
              currentLocation,
              destination,
              customer.id
            );
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
        onOpenChange={bindAdminModalDismiss('report', () => setCustomerReportDialogOpen(false))}
        customer={selectedCustomerForReport}
        technicians={techniciansForReports.length > 0 ? techniciansForReports : technicians}
        onPhotoClick={(url, index, total) => {
          setSelectedPhoto({ url, index, total });
          setPhotoDownloadMeta({ customerName: selectedCustomerForReport?.fullName, type: 'payment' });
          openAdminModal('photo-viewer', {
            customerId: selectedCustomerForReport?.id,
            photoIdx: index,
          });
        }}
        onBillPhotosClick={(photos, index) => {
          setSelectedBillPhotos(photos);
          setSelectedPhoto({ url: photos[index], index, total: photos.length });
          setPhotoDownloadMeta({ customerName: selectedCustomerForReport?.fullName, type: 'bill' });
          openAdminModal('photo-viewer', {
            customerId: selectedCustomerForReport?.id,
            photoIdx: index,
          });
        }}
        onNavigateToCompletedJob={handleNavigateToCompletedJobFromReport}
      />

      {/* Edit Completed Job Dialog */}
      <EditCompletedJobDialog
        open={editCompletedJobDialogOpen}
        onOpenChange={bindAdminModalDismiss('edit-completed', () => {
          setEditCompletedJobDialogOpen(false);
          setSelectedCompletedJob(null);
        })}
        job={selectedCompletedJob}
        editData={completedJobEditData}
        onEditDataChange={setCompletedJobEditData}
        technicians={techniciansForReports.length > 0 ? techniciansForReports : technicians}
        onSave={handleSaveEditedCompletedJob}
      />

      {/* WhatsApp Dialog */}
      {whatsappTechnician && (
        <WhatsAppDialog
          open={whatsappDialogOpen}
          onOpenChange={bindAdminModalDismiss('whatsapp', () => {
            setWhatsappDialogOpen(false);
            setWhatsappTechnician(null);
          })}
          technicianName={whatsappTechnician.name}
          technicianPhone={whatsappTechnician.phone}
          serviceSubType={whatsappServiceSubType}
          customerName={whatsappCustomerName}
          location={whatsappLocation}
          leadSource={whatsappLeadSource}
          customTime={whatsappCustomTime}
        />
      )}

      {/* Send Message Dialog */}
      <SendMessageDialog
        open={sendMessageDialogOpen}
        onOpenChange={bindAdminModalDismiss('send-message', () => {
          setSendMessageDialogOpen(false);
          setSelectedJobForMessage(null);
        })}
        job={selectedJobForMessage}
        onMessageSent={handleMessageSent}
      />

      <AdminEmailComposerDialog
        open={emailComposerOpen}
        onOpenChange={(open) => {
          setEmailComposerOpen(open);
          if (!open) {
            setEmailComposerCustomerId(null);
            setEmailComposerJobId(null);
            setEmailComposerContext('default');
            setEmailComposerForcedBrand(null);
            setEmailComposerTemplate('general');
          }
        }}
        initialCustomerId={emailComposerCustomerId}
        initialJobId={emailComposerJobId}
        initialTemplate={emailComposerTemplate}
        composerContext={emailComposerContext}
        initialForcedBrand={emailComposerForcedBrand}
        onCompletionMailSent={handleMailSent}
      />

      <AdminWhatsAppComposerDialog
        open={whatsappComposerOpen}
        onOpenChange={(open) => {
          setWhatsappComposerOpen(open);
          if (!open) {
            setWhatsappComposerCustomerId(null);
            setWhatsappComposerTemplate('general');
          }
        }}
        initialCustomerId={whatsappComposerCustomerId}
        initialTemplate={whatsappComposerTemplate}
      />

      <ShareTechnicianInfoToCustomerDialog
        open={shareTechnicianInfoDialogOpen}
        onOpenChange={bindAdminModalDismiss('share-job-info', () => {
          setShareTechnicianInfoDialogOpen(false);
          setSelectedJobForShareInfo(null);
        })}
        job={selectedJobForShareInfo}
        customer={selectedJobForShareInfo ? ((selectedJobForShareInfo as any).customer || selectedJobForShareInfo.customer) : null}
        technicians={technicians}
        getEta={getEtaForShareDialog}
      />

      <AddReminderDialog
        open={addReminderDialogOpen}
        onOpenChange={bindAdminModalDismiss('add-reminder', () => setAddReminderDialogOpen(false))}
        entity={reminderEntity}
        contextLabel={reminderContextLabel || undefined}
      />

      <WarrantyManagementDialog
        open={warrantyDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setWarrantyDialogOpen(false);
            setWarrantyDialogCustomer(null);
            onAdminModalOpenChange('warranty', false);
          }
        }}
        initialCustomer={warrantyDialogCustomer}
      />

      <TodayRemindersPopup />

      <CustomerRemindersDialog
        open={!!viewRemindersCustomer}
        onOpenChange={(open) => !open && setViewRemindersCustomer(null)}
        customer={viewRemindersCustomer}
      />

      {/* PIN Dialog */}

      {/* Direct / Office Sale Dialog – quick access from the Recent dropdown */}
      <DirectSaleDialog
        open={directSaleOpen}
        onOpenChange={(open) => handleAdminToolOpenChange('direct-sale', open)}
      />

      <AmountTrackersDialog
        open={amountTrackersOpen}
        onOpenChange={(open) => handleAdminToolOpenChange('amount-trackers', open)}
      />
      <EmailSentLogDialog
        open={emailSentLogOpen}
        onOpenChange={(open) => handleAdminToolOpenChange('sent-email-log', open)}
      />

      <MeasureDistanceToolDialog
        open={measureDistanceOpen}
        onOpenChange={(open) => handleAdminToolOpenChange('measure-distance', open)}
        initialJobs={jobs}
      />

      {/* Recent Accounts Dialog – scoped fetch when opened (no full customer list) */}
      <RecentAccountsDialog
        open={recentAccountsDialogOpen}
        onOpenChange={(open) => handleAdminToolOpenChange('recent-accounts', open)}
        customers={recentAccountsToday}
        loading={loadingRecentAccounts}
        useCustomersAsIs
        onNewJob={(customer) => {
          handleNewJob(customer);
          closeAdminTool();
        }}
        onEditCustomer={(customer) => {
          void handleEditCustomer(customer);
          closeAdminTool();
        }}
      />

      <JobDistanceMeasurementDialog
        open={distanceMeasurementDialogOpen}
        onOpenChange={(open) => {
          setDistanceMeasurementDialogOpen(open);
          if (!open) {
            setIsLoadingCustomDistance(false);
            setIsOpeningCustomDistanceMaps(false);
          }
        }}
        selectedJob={selectedJobForDistance}
        technicianDistances={technicianDistances}
        isCalculatingDistances={isCalculatingDistances}
        measureStopOptions={getMeasureStopSelectOptions()}
        customDistanceFromId={customDistanceFromId}
        customDistanceToId={customDistanceToId}
        onCustomDistanceFromChange={setCustomDistanceFromId}
        onCustomDistanceToChange={setCustomDistanceToId}
        isLoadingCustomDistance={isLoadingCustomDistance}
        isOpeningCustomDistanceMaps={isOpeningCustomDistanceMaps}
        customDistanceResult={customDistanceResult}
        onCalculateCustomDistance={() => void calculateCustomDistanceBetweenStops()}
        onOpenCustomDistanceInMaps={() => void openCustomDistanceInGoogleMaps()}
      />
    </div>
  );
};

export default AdminDashboard;