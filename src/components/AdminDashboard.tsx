import React, { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef, startTransition, lazy as lazyDefault, Suspense } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { ensureAdminSupabaseSession } from '@/lib/auth';
import { normalizeCustomerAddress } from '@/lib/customer-address';
import { CustomerLocationVariant } from '@/lib/customer-locations';
import { ensureSupabaseSessionForWrite } from '@/lib/ensureSupabaseSession';
import { useResumeSync } from '@/hooks/useResumeSync';
import { useAdminAlertSounds } from '@/hooks/useAdminAlertSounds';
import { useAdminJobsRealtime } from '@/hooks/useAdminJobsRealtime';
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
import { preloadDocumentGeneratorModals, scheduleDocumentGeneratorPreload } from '@/lib/document-generator-preload';
import { registerAdminPWA } from '@/lib/pwa';
import { useAdminRole } from '@/lib/useAdminRole';
import { saveAdminCompletedJobEdit } from '@/lib/adminSaveCompletedJobEdit';
import { transformCustomerData, transformTechnicianData } from '@/lib/adminDashboardTransforms';
import {
  followUpDateToStr,
  getJobCompletionDate,
  getTodayLocalDate,
  getTomorrowLocalDate,
  completedDateToStr,
  isDateWithinCompletedRange,
} from '@/lib/adminDashboardDateHelpers';
import {
  buildCustomersWithJobs,
  getFilteredCustomersForDashboard,
  resolveDisplayedCustomers,
} from '@/lib/adminDashboardCustomerFilters';
import { loadFilteredJobsForAdmin } from '@/lib/adminLoadFilteredJobs';
import {
  applyAdminDashboardSnapshot,
  loadAdminDashboardData,
  loadAdminDashboardSecondary,
} from '@/lib/adminLoadDashboardData';
import {
  scheduleAdminAmcJobCreation,
  scheduleAdminFollowUpPromotion,
} from '@/lib/adminDashboardSchedulers';
import { updateAdminJobStatus } from '@/lib/adminJobStatusUpdate';
import {
  submitAdminFollowUp,
  type AdminFollowUpSubmitData,
} from '@/lib/adminFollowUpSubmit';
import { saveAdminJobAssignment } from '@/lib/adminSaveJobAssignment';
import { appendJobToTechnicianVisitOrder } from '@/lib/adminVisitOrder';
import { jobAssignPushText, notifyTechnicianJobPush } from '@/lib/adminTechPushNotify';
import {
  getDefaultAdminMoveToOngoingSchedule,
  performAdminMoveToOngoing,
} from '@/lib/adminMoveToOngoing';
import { removeAdminTeamMember, saveAdminTeamMember } from '@/lib/adminJobTeam';
import { submitAdminJobReassign, unassignAdminJob } from '@/lib/adminJobReassign';
import { shareAdminJobViaWhatsApp } from '@/lib/adminShareJobWhatsApp';
import { getTechnicianAdminWhatsAppPhone } from '@/lib/technicianContact';
import { prepareAdminDenyJob, submitAdminJobDeny } from '@/lib/adminJobDeny';
import {
  markAdminJobMailSent,
  markAdminJobMessageSent,
} from '@/lib/adminJobCompletionMessaging';
import { deleteAdminJob } from '@/lib/adminDeleteJob';
import { updateAdminCustomerStatus } from '@/lib/adminCustomerStatus';
import { deleteAdminCustomer } from '@/lib/adminDeleteCustomer';
import {
  clearAdminCompleteJobSnapshot,
  fetchAdminJobForComplete,
  revertIncompleteAdminCompleteFlow,
  snapshotAdminCompleteJobAssignment,
  validateAdminCompleteTechnicianSelection,
} from '@/lib/adminCompleteJobFlow';
import { deleteAdminCustomerPhoto } from '@/lib/adminCustomerPhotoDelete';
import { deleteAdminJobPhoto } from '@/lib/adminJobPhotoDelete';
import {
  copyAdminPhotoLink,
  downloadAdminPhoto,
  filterValidJobGalleryPhotos,
} from '@/lib/adminPhotoHelpers';
import {
  buildAdminPhotoViewerSelection,
  resolveAdminPhotoViewerSources,
} from '@/lib/adminPhotoViewerNav';
import {
  calculateAdminCustomDistanceBetweenStops,
  getAdminJobEtaForShareDialog,
  getAdminMeasureStopSelectOptions,
  openAdminCustomDistanceInGoogleMaps,
  openAdminJobDistanceMeasure,
  type AdminJobDistanceMeasureCtx,
} from '@/lib/adminJobDistanceMeasure';
import { runAdminDashboardSessionBootstrap } from '@/lib/adminDashboardSessionBootstrap';
import {
  buildCompletedProfitSummary,
  shouldShowCompletedProfitSummary as shouldShowAdminCompletedProfitSummary,
} from '@/lib/adminCompletedJobProfit';
import { calculateAdminCustomerDistance } from '@/lib/adminGoogleMapsDistance';

import { Customer, Job, Technician } from '@/types';
import { cloudinaryService, compressImage, validateImageFile } from '@/lib/cloudinary';
import { toast } from 'sonner';
import { TOAST_VALIDATION } from '@/lib/toastOptions';
import { isNativeApp } from '@/lib/isNativeApp';
import { shouldUseFileInputFallback, requestCameraAccess, createVideoElement, filesToFileList, captureVideoFrameToFile, captureNativeCameraPhoto } from '@/lib/cameraUtils';
import { getCachedQrCodes, cacheQrCodes, shouldUseCache, CommonQrCode, mapCommonQrRow } from '@/lib/qrCodeManager';
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
  clearUnknownCaller,
  isAdminCallerLookupAvailable,
  isUnknownCallerFresh,
  openCallerIntroWhatsApp,
  readUnknownCaller,
  saveUnknownCaller,
  UNKNOWN_CALLER_WINDOW_MS,
  type UnknownCallerRecord,
} from '@/lib/adminIncomingCall';
import {
  clearIncomingAutoSearch,
  INCOMING_CALL_SEARCH_WINDOW_MS,
  isIncomingAutoSearchStale,
  markIncomingAutoSearch,
  markIncomingCallPhoneHandled,
  readIncomingAutoSearch,
  type IncomingAutoSearchRecord,
} from '@/lib/adminSharedIncomingCall';
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
// Letterhead builder is heavy (rich text + sanitizer + preview iframe) and only
// used on demand. Code-split it so the main admin bundle stays lean.
import { toDateOnly } from '@/lib/amcAutoJobSchedule';
import ImageUpload from '@/components/ImageUpload';
import { generateJobNumber, formatPreferredTimeSlot, mapServiceTypesToDbValue, extractLocationFromAddressString, levenshteinDistance, calculateSimilarity, extractPhotoUrls, normalizePhotoUrl, parseJobRequirements, getFormattedTimeSlot, findLeadSource, getLeadSourceFromJob, getJobCustomTimeLabel, normalizeLeadType, normalizeServiceSubType, completedJobMatchesDashboardClientFilters, isOfficeCompletedJob, jobCompletionLocalDateIso, ZERO_COMMISSION_EMPLOYEE_ID, jobsMatchOngoingTab, VISIBLE_ADDRESS_MAX_LEN } from '@/lib/adminUtils';
import { getLocationLinkFromObject } from '@/lib/jobLocationHelpers';
import { applyAutoMoveToOngoingOnDateFlag } from '@/lib/followUpToOngoing';
import { enrichJobsWithAfterPhotosIfNeeded } from '@/lib/jobReportPhotos';
import {
  readAdminDashboardCache,
  clearAdminDashboardCache,
  invalidateAdminDashboardCaches,
  getModuleOngoingJobsSnapshot,
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
import { settingsPanelPath } from '@/lib/settingsUrl';
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
import ArrangeTechnicianVisitOrderDialog from './admin/ArrangeTechnicianVisitOrderDialog';
import NearbyJobsToolDialog from './admin/NearbyJobsToolDialog';
import TechnicianLiveLocationDialog from './admin/TechnicianLiveLocationDialog';
import MessageTechnicianDialog from './admin/MessageTechnicianDialog';
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
import { markNativeBootReady } from '@/lib/nativeBootReady';
import { AdminDeleteConfirmDialogs } from './admin/AdminDeleteConfirmDialogs';
import { AdminOverrideExistingCustomerDialog } from './admin/AdminOverrideExistingCustomerDialog';
import AmcInfoDialog from './admin/AmcInfoDialog';
import MoveToOngoingDialog from './admin/MoveToOngoingDialog';
import CompleteTechnicianSelectDialog from './admin/CompleteTechnicianSelectDialog';
import { AdminDashboardHeader } from './admin/AdminDashboardHeader';
import { AdminSearchResultsBar } from './admin/AdminSearchResultsBar';
import { AdminCallAlertContextBanner, describeCallAlertContext } from './admin/AdminCallAlertContextBanner';
import { DeniedJobsDateFilter } from './admin/DeniedJobsDateFilter';
import { CompletedJobsFiltersSection } from './admin/CompletedJobsFiltersSection';
import JobDistanceMeasurementDialog, {
  type JobCustomDistanceResult,
  type JobTechnicianDistanceRow,
} from './admin/JobDistanceMeasurementDialog';
import { OngoingJobsFiltersDialog } from './admin/OngoingJobsFiltersDialog';
import AdminDashboardOverlayViews, {
  hasAdminDashboardOverlayView,
} from './admin/AdminDashboardOverlayViews';
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
      upiId: String(tech.upi_id || tech.upiId || '').trim().toLowerCase(),
      payeeName: String(tech.payee_name || tech.payeeName || '').trim(),
      upiPhone: String(tech.upi_phone || tech.upiPhone || '').replace(/\D/g, '').slice(-10),
      dynamicUpiEnabled: !!(tech.dynamic_upi_enabled ?? tech.dynamicUpiEnabled),
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
  /** Incoming-call auto-fill — cleared from the UI after 1.5 minutes. */
  const [incomingAutoSearch, setIncomingAutoSearch] = useState<IncomingAutoSearchRecord | null>(
    () => readIncomingAutoSearch()
  );
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
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
  const [amcPrefillFromJob, setAmcPrefillFromJob] = useState<import('@/lib/jobAmcInfo').JobAmcPrefill | null>(
    null
  );
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
  const [isUpdating, setIsUpdating] = useState(false);
  const [addressDialogOpen, setAddressDialogOpen] = useState<{[customerId: string]: boolean}>({});
  const [addressLocationVariant, setAddressLocationVariant] = useState<
    Record<string, CustomerLocationVariant>
  >({});
  
  // Location and distance tracking
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [customerDistances, setCustomerDistances] = useState<Record<string, { distance: string; duration: string; isCalculating: boolean }>>({});
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  
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

  useClearAdminModalOnIOSBackground(() => {
    /* More Options is now local to each customer card — nothing to clear here. */
  });

  // HRO Admin Android app: register this phone for job started/completed
  // pushes. No-op in the browser.
  useEffect(() => {
    void import('@/lib/adminPush').then(({ registerAdminPushToken }) =>
      registerAdminPushToken()
    );
  }, []);

  // Notification tap → Completed / Ongoing + highlight that job (no network wait).
  useEffect(() => {
    let cancelled = false;
    void import('@/lib/adminPushDeepLink').then(({ setAdminPushDeepLinkHandler }) => {
      if (cancelled) return;
      setAdminPushDeepLinkHandler((payload) => {
        if (payload.kind === 'settings' && payload.panel && payload.reminderId) {
          navigate(
            settingsPanelPath(payload.panel, {
              id: payload.reminderId,
              action: payload.action,
            })
          );
          return;
        }

        if (payload.kind === 'payments' && payload.addExpense) {
          navigate(
            adminDashboardLocation(
              buildAdminDashboardSearch(
                {
                  clearModal: true,
                  clearTool: true,
                  clearSearch: true,
                  view: 'payments',
                  addExpense: payload.addExpense,
                  expenseDate: payload.expenseDate || null,
                },
                location.search
              )
            ),
            { replace: true }
          );
          return;
        }

        const { jobId, event, completedDate } = payload;

        // Technician got a call / wrong-line / search — ?search= URL sync
        // runs the customer search; banner keeps tech + reason after tap.
        if (payload.kind === 'tech_call') {
          if (!payload.phone) return;
          const kind =
            payload.event === 'wrong_line_call' ||
            payload.event === 'tech_search' ||
            payload.event === 'missed_call'
              ? payload.event
              : 'tech_call';
          const auto = markIncomingAutoSearch(payload.phone, {
            kind,
            techName: payload.techName,
            fromNumber: payload.fromNumber,
            companyPhone: payload.companyPhone,
            customerId: payload.customerId,
          });
          if (auto) {
            setIncomingAutoSearch(auto);
            const { title, detail } = describeCallAlertContext(auto);
            toast.message(title, { description: detail || undefined, duration: 6500 });
          }
          setHighlightJobId(null);
          navigate(
            adminDashboardLocation(
              buildAdminDashboardSearch(
                { clearModal: true, clearView: true, search: payload.phone },
                location.search
              )
            ),
            { replace: true }
          );
          return;
        }

        if (!jobId) return;

        if (event === 'completed') {
          const dateStr =
            completedDate && /^\d{4}-\d{2}-\d{2}$/.test(completedDate)
              ? completedDate
              : getTodayLocalDate();
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
          setHighlightJobId(jobId);
          navigate(
            adminDashboardLocation(
              buildAdminDashboardSearch(
                { clearModal: true, clearView: true, tab: 'completed', jobId },
                location.search
              )
            ),
            { replace: true }
          );
          return;
        }

        // en_route / otp_entered / default → Ongoing list
        setSearchQuery('');
        setSearchTerm('');
        setSearchResults(null);
        setCurrentPage(1);
        setStatusFilter('ONGOING');
        setHighlightJobId(jobId);
        navigate(
          adminDashboardLocation(
            buildAdminDashboardSearch(
              { clearModal: true, clearView: true, tab: null, jobId },
              location.search
            )
          ),
          { replace: true }
        );
      });
    });
    return () => {
      cancelled = true;
      void import('@/lib/adminPushDeepLink').then(({ setAdminPushDeepLinkHandler }) =>
        setAdminPushDeepLinkHandler(null)
      );
    };
  }, [navigate, location.search]);

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
  const { playNotificationSound, stopNotificationSound, playCompletedJobSound } =
    useAdminAlertSounds();
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
  const arrangeVisitOrderOpen = activeAdminTool === 'arrange-visit-order';
  const nearbyJobsOpen = activeAdminTool === 'nearby-jobs';
  const technicianLiveLocationOpen = activeAdminTool === 'technician-live-location';
  const messageTechnicianOpen = activeAdminTool === 'message-technician';

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
  const [reportPhotoViewerOpen, setReportPhotoViewerOpen] = useState(false);
  const [reportViewerPhoto, setReportViewerPhoto] = useState<{ url: string; index: number; total: number } | null>(null);
  const [reportViewerBillPhotos, setReportViewerBillPhotos] = useState<string[] | null>(null);
  /** While set, report Dialog stays closed so PhotoSwipe can receive pinch/double-tap (Radix RemoveScroll). */
  const reportPhotoSuspendRef = useRef(false);
  const [highlightJobId, setHighlightJobId] = useState<string | null>(null);
  /** Prevent re-scrolling the same highlight when `jobs` updates (e.g. customer search). */
  const highlightScrolledForRef = useRef<string | null>(null);
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
  const [showAllFollowups, setShowAllFollowups] = useState<boolean>(false);
  // Pagination state
  const [currentPage, setCurrentPage] = useState<number>(() => savedUi.currentPage);
  const [pageSize] = useState<number>(20);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [totalCount, setTotalCount] = useState<number>(0);

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
  const [completedDayProfitRevealed, setCompletedDayProfitRevealed] = useState(false);

  useEffect(() => {
    if (!completedDayProfitRevealed) return;
    const t = window.setTimeout(() => setCompletedDayProfitRevealed(false), 10_000);
    return () => window.clearTimeout(t);
  }, [completedDayProfitRevealed]);

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
  const [whatsappDescription, setWhatsappDescription] = useState<string>('');
  const [whatsappAgreedCost, setWhatsappAgreedCost] = useState<string>('');
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
  /** Short TTL cache for document-modal customer rows (GSTIN + address) to avoid repeat egress. */
  const documentCustomerCacheRef = useRef(
    new Map<string, { customer: Customer; fetchedAt: number }>()
  );
  const DOCUMENT_CUSTOMER_CACHE_TTL_MS = 60_000;
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
          const transformed = commonResult.data
            .map((qr: any) => mapCommonQrRow(qr))
            .filter(Boolean) as CommonQrCode[];
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

  const loadFilteredJobs = useCallback(
    (
      filter: typeof statusFilter,
      page: number = 1,
      opts?: { silent?: boolean; cacheOnly?: boolean }
    ) =>
      loadFilteredJobsForAdmin(filter, page, opts, {
        pageSize,
        deniedDateFilter,
        completedDateFilter,
        completedDatePreset,
        completedRangeStartDate,
        completedRangeEndDate,
        completedLeadTypeFilter,
        completedServiceSubTypeFilter,
        completedByFilter,
        loadJobsRequestRef,
        jobsListCacheRef,
        ongoingJobsSnapshotRef,
        techniciansRef,
        getJobsListCacheKey,
        setJobs,
        setLoading,
        setTabCachesStale,
        setTotalCount,
        setTotalPages,
        setCurrentPage,
      }),
    [
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
    ]
  );

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
    applyAdminDashboardSnapshot(snap, {
      setJobs,
      setTotalCount,
      setTotalPages,
      setTechnicians,
      setJobCounts,
      ongoingJobsSnapshotRef,
      techniciansRef,
    });
  }, []);

  const loadDashboardSecondary = useCallback(
    () =>
      loadAdminDashboardSecondary({
        setCustomerAMCStatus,
        setCustomerPriorServiceStatus,
        setTechniciansForReports,
        setAllFollowUpJobs,
        loadBrandsAndModels,
      }),
    [loadBrandsAndModels]
  );

  const amcAutoCreateAttemptedRef = useRef(false);
  const followUpPromoteDayRef = useRef<string | null>(null);

  const scheduleFollowUpPromotion = useCallback(
    () =>
      scheduleAdminFollowUpPromotion({
        followUpPromoteDayRef,
        statusFilter,
        currentPage,
        loadFilteredJobs,
        setAllFollowUpJobs,
      }),
    [statusFilter, currentPage, loadFilteredJobs]
  );

  const scheduleAmcJobCreation = useCallback(
    () =>
      scheduleAdminAmcJobCreation({
        amcAutoCreateAttemptedRef,
        statusFilter,
        currentPage,
        loadFilteredJobs,
      }),
    [statusFilter, currentPage, loadFilteredJobs]
  );

  const loadDashboardData = useCallback(
    (options?: {
      silent?: boolean;
      skipOngoingFetch?: boolean;
      skipTechniciansFetch?: boolean;
    }) =>
      loadAdminDashboardData(options, {
        statusFilter,
        currentPage,
        scheduleAmcJobCreation,
        scheduleFollowUpPromotion,
        loadFilteredJobs,
        loadDashboardSecondary,
        techniciansRef,
        ongoingJobsSnapshotRef,
        setLoading,
        setJobCounts,
        setTechnicians,
        setJobs,
        setTotalCount,
        setTotalPages,
      }),
    [
      statusFilter,
      currentPage,
      scheduleAmcJobCreation,
      scheduleFollowUpPromotion,
      loadFilteredJobs,
      loadDashboardSecondary,
    ]
  );

  const [isInitialLoad, setIsInitialLoad] = useState(
    () =>
      !getModuleDashboardSessionReady() &&
      !initialDashboardCache &&
      restoredJobs.length === 0 &&
      initialOngoingJobs.length === 0
  );
  const dashboardLoadedWithSessionRef = useRef(false);
  const loadDashboardDataRef = useRef(loadDashboardData);
  loadDashboardDataRef.current = loadDashboardData;

  const runDashboardLoadOnceSessionReady = useCallback(
    () =>
      runAdminDashboardSessionBootstrap({
        dashboardLoadedWithSessionRef,
        statusFilter,
        applyAdminSnapshot,
        loadDashboardDataRef,
        setIsInitialLoad,
        setLoading,
      }),
    [applyAdminSnapshot, statusFilter]
  );

  // Load dashboard only after admin JWT is ready (RLS on customers requires authenticated admin)
  useEffect(() => {
    if (authInitializing || !user || !isAdmin) return;
    void runDashboardLoadOnceSessionReady();
  }, [authInitializing, user?.id, isAdmin, runDashboardLoadOnceSessionReady]);

  // APK: keep native logo+bounce until first dashboard paint (not just chunk load).
  useEffect(() => {
    if (!user || !isAdmin || isInitialLoad) return;
    markNativeBootReady();
  }, [user, isAdmin, isInitialLoad]);

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
    setCustomerReportDialogOpen(
      modal === 'report' && !!resolveCustomer(parsed.customerId) && !reportPhotoSuspendRef.current
    );
    setHistoryDialogOpen(modal === 'history' && !!resolveCustomer(parsed.customerId));
    // Open bill as soon as URL says so — click handler already set selectedCustomerForBill.
    // Don't wait on resolveCustomer (search/list race can leave a blank first paint).
    setBillModalOpen(modal === 'bill');
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

  // Jobs already on the Completed tab are not "new" completions — skip alert on later edits (e.g. WhatsApp sent).
  useEffect(() => {
    if (isInitialLoad || statusFilter !== 'COMPLETED') return;
    for (const job of jobs) {
      const st = String((job as { status?: string }).status || job.status || '').toUpperCase();
      if (st === 'COMPLETED' && job.id) {
        jobIdsCompletedByAdminRef.current.add(job.id);
      }
    }
  }, [isInitialLoad, statusFilter, jobs]);

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

  useAdminJobsRealtime({
    isInitialLoad,
    isPollingEnabled,
    statusFilter,
    currentPage,
    loadFilteredJobs,
    loadJobCounts,
    playCompletedJobSound,
    setLastCheckedJobId,
    setJobCounts,
    setCustomerPriorServiceStatus,
    jobIdsCompletedByAdminRef,
    onRealtimeResubscribed: () =>
      resumeAdminSyncRef.current({ invalidateTabCaches: false }),
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

  const handleDeleteCustomer = async () => {
    await deleteAdminCustomer({
      customerToDelete,
      isManager,
      managerRestrictedTitle,
      customers,
      statusFilter,
      currentPage,
      setCustomers,
      setJobs,
      setCustomerJobs,
      setDeleteDialogOpen,
      setCustomerToDelete,
      loadDashboardData,
      loadFilteredJobs,
    });
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

  /** Document modals — slim fetch with short TTL cache (GSTIN not on list embeds). */
  const loadCustomerForDocuments = useCallback(async (customer: Customer): Promise<Customer> => {
    const cached = documentCustomerCacheRef.current.get(customer.id);
    if (cached && Date.now() - cached.fetchedAt < DOCUMENT_CUSTOMER_CACHE_TTL_MS) {
      return cached.customer;
    }

    try {
      const { data, error } = await db.customers.getByIdForDocuments(customer.id);
      if (error || !data) {
        const normalized = normalizeCustomerAddress(customer.address, {
          visible_address:
            customer.address?.visible_address ||
            (customer as { visible_address?: string }).visible_address,
          formattedAddress: customer.location?.formattedAddress,
        });
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
      const transformed = transformCustomerData(data);
      documentCustomerCacheRef.current.set(customer.id, {
        customer: transformed,
        fetchedAt: Date.now(),
      });
      return transformed;
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
    setHighlightJobId(job.id);

    requestAnimationFrame(() => {
      document.querySelector('[data-admin-customer-list]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [navigate, location.search, closeAdminModal]);

  useEffect(() => {
    if (!highlightJobId) {
      highlightScrolledForRef.current = null;
      return;
    }

    let attempts = 0;
    const tryScroll = () => {
      // Already scrolled for this highlight — jobs refresh (search merge, etc.)
      // must not jump the page again.
      if (highlightScrolledForRef.current === highlightJobId) return true;
      const el =
        document.querySelector(`[data-admin-job-id="${highlightJobId}"]`) ||
        document.querySelector(`[data-completed-job-id="${highlightJobId}"]`);
      if (!el) return false;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      highlightScrolledForRef.current = highlightJobId;
      return true;
    };

    // Scroll as soon as the card is in the DOM (list may still be loading).
    if (!tryScroll()) {
      const poll = window.setInterval(() => {
        attempts += 1;
        if (tryScroll() || attempts >= 25) window.clearInterval(poll);
      }, 80);
      const clearPoll = window.setTimeout(() => window.clearInterval(poll), 4000);
      const clearHighlight = window.setTimeout(() => setHighlightJobId(null), 5000);
      return () => {
        window.clearInterval(poll);
        window.clearTimeout(clearPoll);
        window.clearTimeout(clearHighlight);
      };
    }

    const clearHighlight = window.setTimeout(() => setHighlightJobId(null), 5000);
    return () => window.clearTimeout(clearHighlight);
  }, [highlightJobId, jobs, statusFilter]);

  const handleEditCustomer = useCallback((customer: Customer) => {
    setEditingCustomer(customer);
    openAdminModal('edit-customer', { customerId: customer.id });
  }, [openAdminModal]);

  const calculateDistanceAndTime = useCallback(
    (
      origin: { lat: number; lng: number },
      destination: { lat: number; lng: number },
      customerId: string
    ) => calculateAdminCustomerDistance(origin, destination, customerId, setCustomerDistances),
    []
  );

  // Store the function in ref whenever it changes
  useEffect(() => {
    calculateDistanceAndTimeRef.current = calculateDistanceAndTime;
  }, [calculateDistanceAndTime]);

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
        visible_address: extractedLocation ? extractedLocation.substring(0, VISIBLE_ADDRESS_MAX_LEN) : '', // Auto-extracted location
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
    void loadFullCustomerForAction(customer).then(setSelectedCustomerForJob);
  }, [openAdminModal, loadFullCustomerForAction]);

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

      if (newJobFormData.assigned_technician_id) {
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
          ...jobAssignPushText({ job: newJob as any, customer: selectedCustomerForJob as any }),
        });
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
      if (isNativeApp()) {
        const result = await captureNativeCameraPhoto();
        if (result.status === 'ok') {
          handlePhotoUpload(filesToFileList([result.file]));
          return;
        }
        if (result.status === 'cancelled') return;
      }

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
      void video.play().catch(() => {});

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
      buttonContainer.style.position = 'relative';
      buttonContainer.style.zIndex = '10000';
      buttonContainer.style.pointerEvents = 'auto';

      const captureButton = document.createElement('button');
      captureButton.type = 'button';
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
      captureButton.style.touchAction = 'manipulation';

      const cancelButton = document.createElement('button');
      cancelButton.type = 'button';
      cancelButton.textContent = 'Cancel';
      cancelButton.style.padding = '12px 24px';
      cancelButton.style.backgroundColor = '#6b7280';
      cancelButton.style.color = 'white';
      cancelButton.style.border = 'none';
      cancelButton.style.borderRadius = '8px';
      cancelButton.style.cursor = 'pointer';
      cancelButton.style.fontSize = '16px';
      cancelButton.style.touchAction = 'manipulation';

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
      let readyCheckTimeout: ReturnType<typeof setTimeout> | null = null;
      
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
          if (!videoReady) {
            captureButton.disabled = false;
            captureButton.style.opacity = '1';
          }
        }
      }, 500);
      
      setTimeout(() => {
        if (!streamActive) return;
        enableCapture();
        captureButton.disabled = false;
        captureButton.style.opacity = '1';
      }, 1500);
      
      captureButton.disabled = true; // Disable until video is ready
      captureButton.style.opacity = '0.5';
      
      const doCapture = async () => {
        if (!streamActive || captureButton.disabled) return;
        
        try {
          enableCapture();
          if (!video.videoWidth || !video.videoHeight) {
            toast.error('Camera not ready. Please wait a moment and try again.');
            return;
          }
          
          captureButton.disabled = true;
          captureButton.style.opacity = '0.5';

          const file = await captureVideoFrameToFile(video);
          if (!file) {
            toast.error('Failed to capture photo. Please try again.');
            captureButton.disabled = false;
            captureButton.style.opacity = '1';
            return;
          }

          closeCamera();
          handlePhotoUpload(filesToFileList([file]));
        } catch (error: any) {
          console.error('Error capturing photo:', error);
          toast.error(`Failed to capture photo: ${error?.message || 'Unknown error'}`);
          captureButton.disabled = false;
          captureButton.style.opacity = '1';
          closeCamera();
        }
      };

      captureButton.onclick = () => { void doCapture(); };
      captureButton.ontouchend = (e) => {
        e.preventDefault();
        void doCapture();
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

  const runCustomerSearch = useCallback(async (
    rawQuery: string,
    opts?: { skipNavigate?: boolean; silent?: boolean }
  ): Promise<Customer[]> => {
    const trimmedQuery = rawQuery.trim();
    if (!opts?.silent) {
      hapticTap();
    }
    setIsSearching(true);
    if (!opts?.silent) {
      setSearchTerm(trimmedQuery);
      setSearchQuery(trimmedQuery);
    }

    if (!opts?.skipNavigate && !opts?.silent) {
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
    clearIncomingAutoSearch();
    setIncomingAutoSearch(null);
    setHighlightJobId(null);
    const scrollY = window.scrollY ?? document.documentElement.scrollTop ?? 0;
    await runCustomerSearch(searchQuery);
    requestAnimationFrame(() => window.scrollTo(0, scrollY));
  }, [runCustomerSearch, searchQuery]);

  const scrollVisibleAdminSearchIntoView = () => {
    const nodes = document.querySelectorAll<HTMLElement>('[data-admin-search]');
    const el =
      [...nodes].find((n) => n.getClientRects().length > 0) ?? nodes[0] ?? null;
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleSearchFromBookingIntent = useCallback((phone: string) => {
    const query = normalizePhoneForSearch(phone) || phone.trim();
    if (!query) return;
    setHighlightJobId(null);
    void runCustomerSearch(query);
    requestAnimationFrame(() => {
      scrollVisibleAdminSearchIntoView();
    });
  }, [runCustomerSearch]);

  // Caller lookup (HRO Admin APK): unknown callers → compact Recent button only
  // (no search field fill). Known callers still auto-search as before.
  const [unknownCaller, setUnknownCaller] = useState<UnknownCallerRecord | null>(() =>
    isAdminCallerLookupAvailable() ? readUnknownCaller() : null
  );

  const handleSearchFromIncomingCall = useCallback(
    (digits: string, opts?: { offerNotFound?: boolean; ringAt?: number }) => {
      void (async () => {
        // Same as manual search: don't let a leftover job highlight re-scroll
        // when this search merges jobs, and keep the current scroll position.
        setHighlightJobId(null);
        const scrollY = window.scrollY ?? document.documentElement.scrollTop ?? 0;
        const restoreScroll = () => {
          requestAnimationFrame(() => window.scrollTo(0, scrollY));
        };

        // Stop shared-board Realtime from re-searching on the ringing device.
        markIncomingCallPhoneHandled(digits, opts?.ringAt ?? Date.now());

        if (opts?.offerNotFound) {
          // One network search only — reuse hits for the visible UI (was 2× before).
          const results = await runCustomerSearch(digits, { silent: true, skipNavigate: true });
          if (results.length === 0) {
            const at = opts.ringAt ?? Date.now();
            saveUnknownCaller(digits, at);
            setUnknownCaller({ phone: digits, at });
            restoreScroll();
            return;
          }
          clearUnknownCaller();
          setUnknownCaller(null);

          const auto = markIncomingAutoSearch(digits, opts?.ringAt);
          if (auto) setIncomingAutoSearch(auto);

          const trimmed = digits.trim();
          setSearchTerm(trimmed);
          setSearchQuery(trimmed);
          setSearchResults(results);
          adminSearchSyncedRef.current = trimmed;
          const currentSearch = new URLSearchParams(location.search).get('search');
          navigate(
            adminDashboardLocation(
              buildAdminDashboardSearch({ search: trimmed }, location.search)
            ),
            { replace: currentSearch === trimmed }
          );
          restoreScroll();
          return;
        }

        // Shared board / remount restore — single search, fill ?search=.
        const auto = markIncomingAutoSearch(digits, opts?.ringAt);
        if (auto) setIncomingAutoSearch(auto);
        await runCustomerSearch(digits);
        restoreScroll();
      })();
    },
    [runCustomerSearch, location.search, navigate]
  );

  useEffect(() => {
    if (!unknownCaller || !isUnknownCallerFresh(unknownCaller)) {
      if (unknownCaller) {
        clearUnknownCaller();
        setUnknownCaller(null);
      }
      return;
    }
    const remaining = unknownCaller.at + UNKNOWN_CALLER_WINDOW_MS - Date.now();
    const timer = window.setTimeout(() => {
      clearUnknownCaller();
      setUnknownCaller(null);
    }, Math.max(remaining, 0));
    return () => window.clearTimeout(timer);
  }, [unknownCaller]);

  // Auto-filled incoming-call search: clear box/results/?search= when the
  // 1.5-min window ends. Always clear — manual search already nulls this state
  // (so this timer is cancelled). Match-checks were too brittle and left the
  // UI stuck with no timer. Also re-check on focus/visibility (Android WebView
  // often pauses setTimeout while backgrounded).
  useEffect(() => {
    if (!incomingAutoSearch) return;
    const ringAt = incomingAutoSearch.at;

    const clearAutoFill = () => {
      clearIncomingAutoSearch();
      setIncomingAutoSearch(null);
      adminSearchSyncedRef.current = null;
      setSearchQuery('');
      setSearchTerm('');
      setSearchResults(null);
      if (new URLSearchParams(window.location.search).get('search')) {
        navigate(
          adminDashboardLocation(
            buildAdminDashboardSearch({ clearSearch: true }, window.location.search)
          ),
          { replace: true }
        );
      }
    };

    const maybeClear = () => {
      if (Date.now() - ringAt < INCOMING_CALL_SEARCH_WINDOW_MS) return;
      clearAutoFill();
    };

    maybeClear();
    const remaining = ringAt + INCOMING_CALL_SEARCH_WINDOW_MS - Date.now();
    if (remaining <= 0) return;

    const timer = window.setTimeout(maybeClear, remaining);
    const onResume = () => maybeClear();
    document.addEventListener('visibilitychange', onResume);
    window.addEventListener('focus', onResume);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onResume);
      window.removeEventListener('focus', onResume);
    };
  }, [incomingAutoSearch, navigate]);

  const unknownCallerChip = useMemo(() => {
    if (!isAdminCallerLookupAvailable() || !unknownCaller || !isUnknownCallerFresh(unknownCaller)) {
      return null;
    }
    const phone = unknownCaller.phone;
    return {
      phone,
      onWhatsApp: () => openCallerIntroWhatsApp(phone),
      onDismiss: () => {
        clearUnknownCaller();
        setUnknownCaller(null);
      },
    };
  }, [unknownCaller]);

  const callerLookupSearchRef = useRef(handleSearchFromIncomingCall);
  useEffect(() => {
    callerLookupSearchRef.current = handleSearchFromIncomingCall;
  }, [handleSearchFromIncomingCall]);

  useEffect(() => {
    let cleanup: (() => void) | null = null;
    let cancelled = false;
    void import('@/lib/adminIncomingCall').then(async ({ initAdminCallerLookup }) => {
      const dispose = await initAdminCallerLookup((digits, { at }) =>
        callerLookupSearchRef.current(digits, { offerNotFound: true, ringAt: at })
      );
      if (cancelled) {
        dispose();
      } else {
        cleanup = dispose;
      }
    });
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  // Shared caller board: known customers only — auto-search, never the
  // unknown-caller Recent button (local-phone-only, 10 min).
  useEffect(() => {
    let cleanup: (() => void) | null = null;
    let cancelled = false;
    void import('@/lib/adminSharedIncomingCall').then(({ initAdminSharedCallLookup }) => {
      const dispose = initAdminSharedCallLookup((digits, ringAt) =>
        callerLookupSearchRef.current(digits, { offerNotFound: false, ringAt })
      );
      if (cancelled) dispose();
      else cleanup = dispose;
    });
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  // After Settings (or any remount): restore incoming-call auto-search from
  // sessionStorage while the 1.5-min window is still open. Local prefs / shared
  // board are already consumed/"handled", so without this Home opens empty.
  useEffect(() => {
    const record = readIncomingAutoSearch();
    if (!record?.phone) return;
    if (Date.now() - record.at >= INCOMING_CALL_SEARCH_WINDOW_MS) {
      clearIncomingAutoSearch();
      setIncomingAutoSearch(null);
      return;
    }
    setIncomingAutoSearch(record);
    const searchParam =
      new URLSearchParams(window.location.search).get('search')?.trim() ?? '';
    if (
      searchParam &&
      normalizePhoneForSearch(searchParam) === normalizePhoneForSearch(record.phone)
    ) {
      // URL-sync effect will run the customer search for ?search=.
      return;
    }
    callerLookupSearchRef.current(record.phone, {
      offerNotFound: false,
      ringAt: record.at,
    });
  }, []);

  const handleClearSearch = () => {
    hapticTap();
    clearIncomingAutoSearch();
    setIncomingAutoSearch(null);
    adminSearchSyncedRef.current = null;
    // Always clear UI on this click. If we only navigate away from ?search= and
    // return early, the URL sync effect sees a null ref and leaves results on
    // screen — forcing a second X click.
    setSearchQuery('');
    setSearchTerm('');
    setSearchResults(null);
    if (new URLSearchParams(location.search).get('search')) {
      navigate(
        adminDashboardLocation(
          buildAdminDashboardSearch({ clearSearch: true }, location.search)
        ),
        { replace: true }
      );
    }
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
      if (isIncomingAutoSearchStale(searchParam)) {
        clearIncomingAutoSearch();
        setIncomingAutoSearch(null);
        adminSearchSyncedRef.current = null;
        setSearchQuery('');
        setSearchTerm('');
        setSearchResults(null);
        navigate(
          adminDashboardLocation(
            buildAdminDashboardSearch({ clearSearch: true }, location.search)
          ),
          { replace: true }
        );
        return;
      }

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

    // No ?search= in the URL. Clear UI only if we previously synced from the
    // URL (swipe-back / Clear). Do NOT clear when searchTerm was set by
    // incoming-call auto-search before navigate lands, or by any path that
    // intentionally skips URL updates — that caused “scroll but no customer”.
    if (adminSearchSyncedRef.current != null) {
      adminSearchSyncedRef.current = null;
      setSearchQuery('');
      setSearchTerm('');
      setSearchResults(null);
    }
  }, [location.pathname, location.search, navigate, openAdminModal, runCustomerSearch]);

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
      setHighlightJobId(null);
      const scrollY = window.scrollY ?? document.documentElement.scrollTop ?? 0;
      void runCustomerSearch(normalized).then(() => {
        requestAnimationFrame(() => window.scrollTo(0, scrollY));
      });
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
    preloadDocumentGeneratorModals();
    setSelectedCustomerForBill(customer);
    openAdminModal('bill', { customerId: customer.id });
  }, [openAdminModal]);

  const handleBillModalClose = () => {
    setBillModalOpen(false);
    closeAdminModal();
    setSelectedCustomerForBill(null);
  };

  const handleGenerateQuotation = (customer: Customer) => {
    preloadDocumentGeneratorModals();
    setSelectedCustomerForQuotation(customer);
    setQuotationModalOpen(true);
    void loadCustomerForDocuments(customer).then(setSelectedCustomerForQuotation);
  };

  const handleQuotationModalClose = () => {
    setQuotationModalOpen(false);
    setSelectedCustomerForQuotation(null);
  };

  const handleGenerateAMC = (
    customer: Customer,
    fromJob?: import('@/lib/jobAmcInfo').JobAmcPrefill | null
  ) => {
    preloadDocumentGeneratorModals();
    setSelectedCustomerForAMC(customer);
    setAmcPrefillFromJob(fromJob ?? null);
    setAmcModalOpen(true);
    void loadCustomerForDocuments(customer).then(setSelectedCustomerForAMC);
    if (fromJob) return;
    // Menu → Generate AMC: pull AMC fields from the latest completed job (if any).
    void import('@/lib/jobAmcInfo').then(({ fetchLatestJobAmcPrefill }) =>
      fetchLatestJobAmcPrefill(customer.id).then((prefill) => {
        if (prefill) setAmcPrefillFromJob(prefill);
      })
    );
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
    setAmcPrefillFromJob(null);
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
    preloadDocumentGeneratorModals();
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
    await saveAdminJobAssignment({
      jobToAssign,
      selectedTechnicianId,
      followUpAssignFlow,
      statusFilter,
      currentPage,
      technicians,
      setFollowUpAssignFlow,
      setFollowUpAssignTechnicianId,
      setAssignJobDialogOpen,
      setAssignAfterMoveToOngoing,
      handleMoveToOngoing,
      scrollPositionBeforeWhatsAppRef,
      setWhatsappTechnician,
      setWhatsappServiceSubType,
      setWhatsappCustomerName,
      setWhatsappLocation,
      setWhatsappLeadSource,
      setWhatsappCustomTime,
      setWhatsappDescription,
      setWhatsappAgreedCost,
      setWhatsappDialogOpen,
      openAdminWhatsappModal,
      closeAdminModal,
      setJobToAssign,
      setSelectedTechnicianId,
      loadFilteredJobs,
    });
  };

  const handleAddTeam = async (job: Job) => {
    setJobForTeam(job);
    setSelectedTeamMemberId('');
    setAddTeamDialogOpen(true);

    // Reload technicians to get latest data
    await reloadTechnicians();
  };

  const handleSaveTeamMember = async () => {
    await saveAdminTeamMember({
      jobForTeam,
      selectedTeamMemberId,
      technicians,
      statusFilter,
      currentPage,
      setAddTeamDialogOpen,
      setJobForTeam,
      setSelectedTeamMemberId,
      loadFilteredJobs,
    });
  };

  const handleRemoveTeam = async (job: Job) => {
    setJobForRemoveTeam(job);
    setSelectedTeamMemberToRemove('');
    setRemoveTeamDialogOpen(true);

    // Reload technicians to get latest data
    await reloadTechnicians();
  };

  const handleSaveTeamMemberRemoval = async () => {
    await removeAdminTeamMember({
      jobForRemoveTeam,
      selectedTeamMemberToRemove,
      statusFilter,
      currentPage,
      setRemoveTeamDialogOpen,
      setJobForRemoveTeam,
      setSelectedTeamMemberToRemove,
      loadFilteredJobs,
    });
  };

  // Bulk assignment removed - not needed


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
    await submitAdminJobReassign({
      jobToReassign,
      selectedTechnicianForReassign,
      technicians,
      statusFilter,
      currentPage,
      scrollPositionBeforeWhatsAppRef,
      setJobs,
      setReassignDialogOpen,
      setWhatsappTechnician,
      setWhatsappServiceSubType,
      setWhatsappCustomerName,
      setWhatsappLocation,
      setWhatsappLeadSource,
      setWhatsappCustomTime,
      setWhatsappDescription,
      setWhatsappAgreedCost,
      setWhatsappDialogOpen,
      openAdminWhatsappModal,
      closeAdminModal,
      setJobToReassign,
      setSelectedTechnicianForReassign,
      loadFilteredJobs,
    });
  };

  const handleUnassignJob = async (job: Job) => {
    await unassignAdminJob(job, { setJobs, setCustomerJobs });
  };

  const handleEditJob = (job: Job) => {
    openAdminModal('edit-job', { jobId: job.id });
  };

  // handleEditJobSubmit moved to EditJobDialog component

  const handleShareJobWhatsApp = (job: Job) => shareAdminJobViaWhatsApp(job, technicians);

  const jobDistanceMeasureCtx = useMemo(
    (): AdminJobDistanceMeasureCtx => ({
      technicians,
      jobs,
      setTechnicians,
      selectedJobForDistance,
      customDistanceFromId,
      customDistanceToId,
      setSelectedJobForDistance,
      setCustomDistanceResult,
      setIsLoadingCustomDistance,
      setIsOpeningCustomDistanceMaps,
      setCustomDistanceFromId,
      setCustomDistanceToId,
      setDistanceMeasurementDialogOpen,
      setTechnicianDistances,
      setIsCalculatingDistances,
    }),
    [
      technicians,
      jobs,
      selectedJobForDistance,
      customDistanceFromId,
      customDistanceToId,
    ]
  );

  const handleMeasureDistance = useCallback(
    (job: Job) => openAdminJobDistanceMeasure(job, jobDistanceMeasureCtx),
    [jobDistanceMeasureCtx]
  );

  const calculateCustomDistanceBetweenStops = useCallback(
    () => calculateAdminCustomDistanceBetweenStops(jobDistanceMeasureCtx),
    [jobDistanceMeasureCtx]
  );

  const openCustomDistanceInGoogleMaps = useCallback(
    () => openAdminCustomDistanceInGoogleMaps(jobDistanceMeasureCtx),
    [jobDistanceMeasureCtx]
  );

  const getMeasureStopSelectOptions = useCallback(
    () => getAdminMeasureStopSelectOptions(jobDistanceMeasureCtx),
    [jobDistanceMeasureCtx]
  );

  const getEtaForShareDialog = useCallback(
    (job: Job) => getAdminJobEtaForShareDialog(job, technicians),
    [technicians]
  );

  const handleJobStatusUpdate = useCallback(
    (jobId: string, newStatus: string) =>
      updateAdminJobStatus(jobId, newStatus, {
        jobs,
        technicians,
        setCustomerJobs,
        setJobs,
      }),
    [jobs, technicians]
  );

  // Handle scheduling follow-up
  const handleScheduleFollowUp = (job: Job) => {
    openAdminModal('follow-up', { jobId: job.id });
  };

  const handleFollowUpSubmit = useCallback(
    (jobId: string, followUpData: AdminFollowUpSubmitData) =>
      submitAdminFollowUp(jobId, followUpData, {
        jobs,
        customerJobs,
        statusFilter,
        currentPage,
        setJobs,
        setCustomerJobs,
        setAllFollowUpJobs,
        loadFilteredJobs,
      }),
    [jobs, customerJobs, statusFilter, currentPage, loadFilteredJobs]
  );

  const handleMoveToOngoing = (job: Job) => {
    const { date, timeSlot, customTime } = getDefaultAdminMoveToOngoingSchedule();
    setMoveToOngoingDate(date);
    setMoveToOngoingTimeSlot(timeSlot);
    setMoveToOngoingCustomTime(customTime);
    setSelectedJobForMoveToOngoing(job);
    openAdminModal('move-ongoing', { jobId: job.id });
  };

  const handleAssignFromFollowUp = (job: Job) => {
    setFollowUpAssignFlow(true);
    handleAssignJob(job);
  };

  const performMoveToOngoing = async () => {
    await performAdminMoveToOngoing({
      selectedJob: selectedJobForMoveToOngoing,
      moveToOngoingDate,
      moveToOngoingTimeSlot,
      moveToOngoingCustomTime,
      assignAfterMoveToOngoing,
      followUpAssignTechnicianId,
      jobs,
      statusFilter,
      currentPage,
      technicians,
      userId: user?.id,
      setIsUpdating,
      setJobs,
      setCustomerJobs,
      setAllFollowUpJobs,
      setAssignAfterMoveToOngoing,
      setFollowUpAssignTechnicianId,
      setMoveToOngoingDialogOpen,
      setSelectedJobForMoveToOngoing,
      setMoveToOngoingDate,
      setMoveToOngoingTimeSlot,
      setMoveToOngoingCustomTime,
      loadFilteredJobs,
    });
  };

  const handleDenyJob = async (job: Job) => {
    const jobWithCustomer = await prepareAdminDenyJob(job);
    setSelectedJobForDeny(jobWithCustomer);
    setDenyReason('');
    openAdminModal('deny', { jobId: jobWithCustomer.id });
  };

  const handleDenyJobSubmit = async () => {
    await submitAdminJobDeny({
      selectedJobForDeny,
      denyReason,
      setJobs,
      setCustomerJobs,
      setDenyDialogOpen,
      setSelectedJobForDeny,
      setDenyReason,
    });
  };

  const handleMailSent = async (jobId: string) => {
    await markAdminJobMailSent(jobId, {
      jobs,
      statusFilter,
      currentPage,
      loadCompletedJobDetails,
      loadFilteredJobs,
      jobIdsSkipCompletionSoundRef: jobIdsCompletedByAdminRef,
    });
  };

  const handleMessageSent = async (jobId: string) => {
    await markAdminJobMessageSent(jobId, {
      jobs,
      statusFilter,
      currentPage,
      loadCompletedJobDetails,
      loadFilteredJobs,
      closeAdminModal,
      setSelectedJobForMessage,
      jobIdsSkipCompletionSoundRef: jobIdsCompletedByAdminRef,
    });
  };

  // Calculate AMC end date: agreement date + years - 1 day
  // calculateAMCEndDate moved to CompleteJobDialog component

  const revertIncompleteCompleteFlow = useCallback(
    () =>
      revertIncompleteAdminCompleteFlow({
        snapshotRef: completeFlowSnapshotRef,
        setJobs,
        setCustomerJobs,
      }),
    []
  );

  const handleCompleteJob = async (job: Job) => {
    const jobWithCustomer = await fetchAdminJobForComplete(job);
    setSelectedJobForComplete(jobWithCustomer);
    snapshotAdminCompleteJobAssignment(jobWithCustomer, completeFlowSnapshotRef);
    setSelectedTechnicianForComplete('');
    openAdminModal('complete', { jobId: jobWithCustomer.id });
    setTechnicianSelectDialogOpen(true);
  };

  const handleTechnicianSelectedForComplete = async () => {
    if (
      !validateAdminCompleteTechnicianSelection(
        selectedTechnicianForComplete,
        selectedJobForComplete,
        technicians
      )
    ) {
      return;
    }

    void loadQrCodes(true).catch((err) => console.error('Error loading QR codes:', err));

    suppressCompleteFlowRevertRef.current = true;
    setTechnicianSelectDialogOpen(false);
    setCompleteDialogOpen(true);
  };

  const handleDeleteJob = async () => {
    await deleteAdminJob(jobToDelete, {
      statusFilter,
      setJobs,
      setCustomerJobs,
      setLoadedCompletedJobDetails,
      setLoadingCompletedJobDetails,
      setTotalCount,
      closeAdminModal,
      setDeleteJobDialogOpen,
      setJobToDelete,
    });
  };

  const handleCustomerStatusUpdate = async (
    customerId: string,
    newStatus: 'ACTIVE' | 'INACTIVE' | 'BLOCKED'
  ) => {
    await updateAdminCustomerStatus(customerId, newStatus, setCustomers);
  };

  const openPhotoGallery = (jobId: string, photos: string[], type: 'before' | 'after' | 'photos') => {
    try {
      const validPhotos = filterValidJobGalleryPhotos(photos);

      if (validPhotos.length === 0) {
        toast.info('No photos available for this job');
        return;
      }

      setSelectedJobPhotos({ jobId, photos: validPhotos, type: type as 'before' | 'after' });
      const photoType = type === 'before' || type === 'after' ? type : 'after';
      openAdminModal('photos', { jobId, photoType });
    } catch {
      toast.error('Failed to open photo gallery');
    }
  };

  const handleDeletePhoto = (jobId: string, photoIndex: number, photoUrl: string) => {
    setPhotoToDelete({ jobId, photoIndex, photoUrl });
    setDeletePhotoDialogOpen(true);
  };

  const openPhotoViewer = (photoUrl: string, photoIndex: number, totalPhotos: number, jobId?: string) => {
    setSelectedBillPhotos(null);
    setSelectedCustomerPhotos(null);
    setSelectedPhoto({ url: photoUrl, index: photoIndex, total: totalPhotos });
    const parsed = parseAdminDashboardUrl(location.search);
    openAdminModal('photo-viewer', {
      jobId: jobId ?? parsed.jobId ?? undefined,
      photoIdx: photoIndex,
    });
  };

  const goToPreviousPhoto = () => {
    if (!selectedPhoto) return;
    const photos = resolveAdminPhotoViewerSources({
      selectedBillPhotos,
      selectedCustomerPhotos,
      selectedJobPhotos,
    });
    if (!photos?.length) return;
    setSelectedPhoto(buildAdminPhotoViewerSelection(photos, 'prev', selectedPhoto));
  };

  const goToNextPhoto = () => {
    if (!selectedPhoto) return;
    const photos = resolveAdminPhotoViewerSources({
      selectedBillPhotos,
      selectedCustomerPhotos,
      selectedJobPhotos,
    });
    if (!photos?.length) return;
    setSelectedPhoto(buildAdminPhotoViewerSelection(photos, 'next', selectedPhoto));
  };

  const downloadPhoto = async (photoUrl: string, photoIndex: number) => {
    await downloadAdminPhoto(photoUrl, photoIndex, photoDownloadMeta);
  };

  const copyPhotoLink = async (photoUrl: string) => {
    await copyAdminPhotoLink(photoUrl);
  };

  const confirmDeletePhoto = async () => {
    await deleteAdminJobPhoto(photoToDelete, {
      jobs,
      selectedJobPhotos,
      setIsDeletingPhoto,
      setJobs,
      setCustomerJobs,
      setSelectedJobPhotos,
      setPhotoGalleryOpen,
      setDeletePhotoDialogOpen,
      setPhotoToDelete,
    });
  };

  const confirmDeleteCustomerPhoto = async () => {
    await deleteAdminCustomerPhoto(customerPhotoToDelete, selectedCustomerForPhotos, {
      customerPhotos,
      selectedPhoto,
      setIsDeletingCustomerPhoto,
      setCustomerPhotos,
      setSelectedPhoto,
      setDeleteCustomerPhotoDialogOpen,
      setCustomerPhotoToDelete,
      loadCustomerPhotos,
    });
  };

  // When user has searched, use API results (find any customer in DB); otherwise use derived list (customers with jobs)
  const baseCustomers = searchTerm.trim() ? (searchResults ?? []) : customers;

  // Filter data based on search term when NOT using API search (empty search = use all derived customers)
  const filteredCustomers = searchTerm.trim()
    ? baseCustomers
    : customers;

  const doesCompletedJobMatchFilters = useCallback((job: any): boolean => {
    return completedJobMatchesDashboardClientFilters(job, {
      leadType: completedLeadTypeFilter,
      serviceSubType: completedServiceSubTypeFilter,
      completedBy: completedByFilter,
    }, technicians as any);
  }, [
    completedLeadTypeFilter,
    completedServiceSubTypeFilter,
    completedByFilter,
    technicians,
  ]);

  // Get today's and tomorrow's date strings for filtering followups (local YYYY-MM-DD)
  const todayDateStr = getTodayLocalDate();
  const tomorrowDateStr = getTomorrowLocalDate();

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

  const customersWithJobs = useMemo(
    () => buildCustomersWithJobs(baseCustomers, jobs),
    [baseCustomers, jobs]
  );

  const getFilteredCustomers = useCallback(
    () =>
      getFilteredCustomersForDashboard({
        statusFilter,
        jobs,
        baseCustomers,
        customersWithJobs,
        showAllFollowups,
        completedDateFilter,
        currentPage,
        totalPages,
        totalCount,
        doesCompletedJobMatchFilters,
        doesOngoingJobMatchFilters,
      }),
    [
      statusFilter,
      jobs,
      baseCustomers,
      customersWithJobs,
      showAllFollowups,
      completedDateFilter,
      currentPage,
      totalPages,
      totalCount,
      doesCompletedJobMatchFilters,
      doesOngoingJobMatchFilters,
    ]
  );

  const displayedCustomers = useMemo(
    () =>
      resolveDisplayedCustomers({
        searchTerm,
        statusFilter,
        searchFilteredCustomers: filteredCustomers,
        customersWithJobs,
        todayDateStr,
        tomorrowDateStr,
        doesOngoingJobMatchFilters,
        getFilteredCustomers,
      }),
    [
      searchTerm,
      statusFilter,
      filteredCustomers,
      customersWithJobs,
      todayDateStr,
      tomorrowDateStr,
      doesOngoingJobMatchFilters,
      getFilteredCustomers,
    ]
  );

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
  const shouldShowCompletedProfitSummary = shouldShowAdminCompletedProfitSummary({
    statusFilter,
    completedDatePreset,
    completedDateFilter,
    completedLeadTypeFilter,
    completedServiceSubTypeFilter,
    completedByFilter,
    searchTerm,
  });

  const completedProfitSummary = shouldShowCompletedProfitSummary
    ? buildCompletedProfitSummary(displayedCustomers, technicians, techniciansForReports)
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
      highlightJobId,
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
      highlightJobId,
      doesOngoingJobMatchFilters,
      getJobCompletionDate,
      applyListCustomerContactToCachedJob,
    ]
  );

  const adminListActionsRef = useRef<AdminDashboardListActions>({} as AdminDashboardListActions);
  adminListActionsRef.current = {
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
        return isDateWithinCompletedRange(completedDateToStr(completionDate), {
          completedDatePreset,
          completedDateFilter,
          completedRangeStartDate,
          completedRangeEndDate,
        });
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
    return <AdminScreenLoader message="" />;
  }

  if (
    hasAdminDashboardOverlayView({
      showGSTInvoicesPage,
      gstInSubScreen,
      onHideGSTInvoices: handleHideGSTInvoices,
      onGstSubScreenChange: setGstInSubScreen,
      showAMCViewPage,
      onHideAMCView: handleHideAMCView,
      onAMCDeleted: reloadAMCStatus,
      showLetterheadDocsPage,
      letterheadInitialType,
      onLetterheadBack: () => navigate('/admin', { replace: true }),
      currentView,
      onViewChange: handleViewChange,
    })
  ) {
    return (
      <AdminDashboardOverlayViews
        showGSTInvoicesPage={showGSTInvoicesPage}
        gstInSubScreen={gstInSubScreen}
        onHideGSTInvoices={handleHideGSTInvoices}
        onGstSubScreenChange={setGstInSubScreen}
        showAMCViewPage={showAMCViewPage}
        onHideAMCView={handleHideAMCView}
        onAMCDeleted={reloadAMCStatus}
        showLetterheadDocsPage={showLetterheadDocsPage}
        letterheadInitialType={letterheadInitialType}
        onLetterheadBack={() => navigate('/admin', { replace: true })}
        currentView={currentView}
        onViewChange={handleViewChange}
      />
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
          unknownCallerPending={Boolean(unknownCallerChip)}
        />

        {incomingAutoSearch?.kind ? (
          <AdminCallAlertContextBanner
            record={incomingAutoSearch}
            onDismiss={() => {
              clearIncomingAutoSearch();
              setIncomingAutoSearch(null);
            }}
          />
        ) : null}

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
            <button
              type="button"
              onClick={() => setCompletedDayProfitRevealed((v) => !v)}
              className="mt-6 w-full rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-left text-sm text-gray-800 touch-manipulation"
              title={completedDayProfitRevealed ? 'Hide profit' : 'Show profit'}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="font-semibold text-green-900">
                    Profit of Day
                  </div>
                  {completedDayProfitRevealed ? (
                    <div className="text-xs text-gray-600">
                      Amount - spare parts - lead cost - technician commission
                    </div>
                  ) : null}
                </div>
                {completedDayProfitRevealed ? (
                  <div className={completedProfitSummary.profit >= 0 ? 'text-lg font-bold text-green-700' : 'text-lg font-bold text-red-600'}>
                    ₹{completedProfitSummary.profit.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                ) : (
                  <div className="text-lg font-bold text-gray-400 tracking-wider select-none">
                    ₹••••••
                  </div>
                )}
              </div>
              {completedDayProfitRevealed ? (
                <div className="mt-2 text-xs text-gray-600">
                  Amount ₹{completedProfitSummary.revenue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  {' '}− spare parts ₹{completedProfitSummary.sparePartsCost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  {' '}− lead ₹{completedProfitSummary.leadCost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  {' '}− commission ₹{completedProfitSummary.commission.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              ) : null}
            </button>
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
          const waPhone = assignedTechnician
            ? getTechnicianAdminWhatsAppPhone(assignedTechnician)
            : '';
          if (!waPhone) return;
          scrollPositionBeforeWhatsAppRef.current = window.scrollY;
          const vis = payload.visibleAddress;
          const addr = payload.address;
          const locationText =
            vis && String(vis).trim()
              ? String(vis).trim()
              : addr?.area || addr?.city || '';
          setWhatsappTechnician({
            name: assignedTechnician.fullName || (assignedTechnician as { full_name?: string }).full_name || 'Technician',
            phone: waPhone,
          });
          setWhatsappServiceSubType(payload.serviceSubType);
          setWhatsappCustomerName(payload.customerName);
          setWhatsappLocation(locationText || '');
          setWhatsappLeadSource(payload.leadSource || '');
          setWhatsappCustomTime(payload.customTime || '');
          setWhatsappDescription(payload.description || '');
          setWhatsappAgreedCost(payload.agreedCost || '');
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
          documentCustomerCacheRef.current.delete(updatedCustomer.id);
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
          documentCustomerCacheRef.current.delete(customerId);
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
        selectedCustomerPhotos={selectedCustomerPhotos}
        onPrevious={goToPreviousPhoto}
        onNext={goToNextPhoto}
        onDownload={downloadPhoto}
        // Arrows whenever the open list has multiple photos (bills, job gallery, customer gallery).
        showNavigation={Boolean(
          (selectedBillPhotos && selectedBillPhotos.length > 1) ||
            (selectedCustomerPhotos && selectedCustomerPhotos.length > 1) ||
            (selectedJobPhotos?.photos && selectedJobPhotos.photos.length > 1),
        )}
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
          const waPhone = assignedTechnician
            ? getTechnicianAdminWhatsAppPhone(assignedTechnician)
            : '';
          if (!waPhone) return;
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
            phone: waPhone,
          });
          setWhatsappServiceSubType(payload.serviceSubType);
          setWhatsappCustomerName(payload.customerName);
          setWhatsappLocation(locationText || '');
          setWhatsappLeadSource(payload.leadSource || '');
          setWhatsappCustomTime(payload.customTime || '');
          setWhatsappDescription(payload.description || '');
          setWhatsappAgreedCost(payload.agreedCost || '');
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
          setSelectedJobPhotos(null);
          setSelectedBillPhotos(null);
          setSelectedCustomerPhotos(reversedPhotos);
          setSelectedPhoto({ url: photo, index, total: reversedPhotos.length || total });
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
        <Suspense
          fallback={
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="flex items-center gap-3 rounded-lg bg-white px-5 py-4 shadow-lg text-sm text-slate-700">
                <RefreshCw className="w-5 h-5 animate-spin text-emerald-600" />
                Opening bill…
              </div>
            </div>
          }
        >
          <BillModal
            isOpen={billModalOpen}
            onClose={handleBillModalClose}
            customer={selectedCustomerForBill}
          />
        </Suspense>
      )}

      {/* Quotation Generation Modal */}
      {quotationModalOpen && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="flex items-center gap-3 rounded-lg bg-white px-5 py-4 shadow-lg text-sm text-slate-700">
                <RefreshCw className="w-5 h-5 animate-spin text-emerald-600" />
                Opening quotation…
              </div>
            </div>
          }
        >
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
            initialFromJob={amcPrefillFromJob}
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
          clearAdminCompleteJobSnapshot(completeFlowSnapshotRef);
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

      {/* Customer Report Dialog — suspend (close) while photo viewer is open so pinch/zoom works */}
      <CustomerReportDialog
        open={customerReportDialogOpen}
        photoViewerOpen={reportPhotoViewerOpen}
        onOpenChange={bindAdminModalDismiss('report', () => {
          if (reportPhotoSuspendRef.current) return;
          setCustomerReportDialogOpen(false);
          setReportPhotoViewerOpen(false);
          setReportViewerPhoto(null);
          setReportViewerBillPhotos(null);
        })}
        customer={selectedCustomerForReport}
        technicians={techniciansForReports.length > 0 ? techniciansForReports : technicians}
        onPhotoClick={(url, index, total, photos) => {
          const list = photos && photos.length > 0 ? photos : [url];
          const safeIndex = Math.min(Math.max(0, index), list.length - 1);
          reportPhotoSuspendRef.current = true;
          setCustomerReportDialogOpen(false);
          window.setTimeout(() => {
            setReportViewerBillPhotos(list);
            setReportViewerPhoto({
              url: list[safeIndex] || url,
              index: safeIndex,
              total: list.length || total,
            });
            setPhotoDownloadMeta({
              customerName: selectedCustomerForReport?.fullName,
              type: 'payment',
            });
            setReportPhotoViewerOpen(true);
          }, 50);
        }}
        onBillPhotosClick={(photos, index) => {
          if (!photos.length) return;
          const safeIndex = Math.min(Math.max(0, index), photos.length - 1);
          reportPhotoSuspendRef.current = true;
          setCustomerReportDialogOpen(false);
          window.setTimeout(() => {
            setReportViewerBillPhotos(photos);
            setReportViewerPhoto({
              url: photos[safeIndex],
              index: safeIndex,
              total: photos.length,
            });
            setPhotoDownloadMeta({
              customerName: selectedCustomerForReport?.fullName,
              type: 'bill',
            });
            setReportPhotoViewerOpen(true);
          }, 50);
        }}
        onNavigateToCompletedJob={handleNavigateToCompletedJobFromReport}
      />

      {/* Photo viewer for customer report (report Dialog is suspended/closed while this is open) */}
      <PhotoViewerDialog
        open={reportPhotoViewerOpen}
        onOpenChange={(open) => {
          if (open) {
            setReportPhotoViewerOpen(true);
            return;
          }
          setReportPhotoViewerOpen(false);
          setReportViewerPhoto(null);
          setReportViewerBillPhotos(null);
          if (reportPhotoSuspendRef.current) {
            reportPhotoSuspendRef.current = false;
            setCustomerReportDialogOpen(true);
          }
        }}
        selectedPhoto={reportViewerPhoto}
        selectedBillPhotos={reportViewerBillPhotos}
        selectedJobPhotos={null}
        showNavigation={Boolean(reportViewerBillPhotos && reportViewerBillPhotos.length > 1)}
        onPrevious={() => {
          if (!reportViewerPhoto || !reportViewerBillPhotos || reportViewerBillPhotos.length <= 1) return;
          const newIndex =
            reportViewerPhoto.index > 0 ? reportViewerPhoto.index - 1 : reportViewerBillPhotos.length - 1;
          setReportViewerPhoto({
            url: reportViewerBillPhotos[newIndex],
            index: newIndex,
            total: reportViewerBillPhotos.length,
          });
        }}
        onNext={() => {
          if (!reportViewerPhoto || !reportViewerBillPhotos || reportViewerBillPhotos.length <= 1) return;
          const newIndex =
            reportViewerPhoto.index < reportViewerBillPhotos.length - 1
              ? reportViewerPhoto.index + 1
              : 0;
          setReportViewerPhoto({
            url: reportViewerBillPhotos[newIndex],
            index: newIndex,
            total: reportViewerBillPhotos.length,
          });
        }}
        onDownload={(photoUrl, photoIndex) => {
          void downloadAdminPhoto(photoUrl, photoIndex, {
            customerName: selectedCustomerForReport?.fullName,
            type: reportViewerBillPhotos ? 'bill' : 'payment',
          });
        }}
        onClose={() => {
          setReportPhotoViewerOpen(false);
          setReportViewerPhoto(null);
          setReportViewerBillPhotos(null);
          if (reportPhotoSuspendRef.current) {
            reportPhotoSuspendRef.current = false;
            setCustomerReportDialogOpen(true);
          }
        }}
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
          description={whatsappDescription}
          agreedCost={whatsappAgreedCost}
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

      <ArrangeTechnicianVisitOrderDialog
        open={arrangeVisitOrderOpen}
        onOpenChange={(open) => handleAdminToolOpenChange('arrange-visit-order', open)}
        technicians={technicians}
        initialJobs={jobs}
        onSaved={(technicianId, orderedJobIds) => {
          const orderMap = new Map(orderedJobIds.map((id, i) => [id, i + 1]));
          setJobs((prev) =>
            prev.map((j) => {
              const tid = (j as any).assigned_technician_id || j.assignedTechnicianId;
              if (String(tid) !== String(technicianId)) return j;
              const nextOrder = orderMap.get(j.id);
              if (nextOrder == null) return j;
              return { ...j, visit_order: nextOrder, visitOrder: nextOrder };
            })
          );
        }}
      />

      <NearbyJobsToolDialog
        open={nearbyJobsOpen}
        onOpenChange={(open) => handleAdminToolOpenChange('nearby-jobs', open)}
        technicians={technicians}
      />

      <TechnicianLiveLocationDialog
        open={technicianLiveLocationOpen}
        onOpenChange={(open) => handleAdminToolOpenChange('technician-live-location', open)}
        technicians={technicians}
      />

      <MessageTechnicianDialog
        open={messageTechnicianOpen}
        onOpenChange={(open) => handleAdminToolOpenChange('message-technician', open)}
        technicians={technicians}
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
        unknownCaller={unknownCallerChip}
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