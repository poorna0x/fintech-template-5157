import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate, Navigate } from 'react-router-dom';
import { preloadLeadCatalog } from '@/lib/leadCatalog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import Logo from '@/components/Logo';
import PhotoViewerDialog from '@/components/admin/PhotoViewerDialog';
import TechnicianOtpRequestCard from '@/components/technician/TechnicianOtpRequestCard';
import {
  buildAdminPhotoViewerSelection,
  resolveAdminPhotoViewerSources,
} from '@/lib/adminPhotoViewerNav';
import { 
  Wrench, 
  Filter, 
  Clock, 
  MapPin, 
  Phone, 
  Mail, 
  Calendar,
  CheckCircle,
  Play,
  Pause,
  AlertCircle,
  LogOut,
  User,
  Eye,
  CalendarPlus,
  XCircle,
  Camera,
  MessageCircle,
  MoreVertical,
  Settings,
  ArrowRight,
  RotateCcw,
  Bell,
  RefreshCw,
  FileText,
  Star,
  Receipt,
  QrCode,
  Package,
  ChevronLeft,
  ChevronRight,
  IndianRupee,
  Pencil,
  Search,
} from 'lucide-react';
import { toast } from 'sonner';
import { getAmcDocumentBrandLabel } from '@/lib/amc-brand';
import { TOAST_VALIDATION } from '@/lib/toastOptions';
import { formatCompletedWhen } from '@/lib/relativeTime';
import { getJobEquipmentDisplay, resolveJobEquipment, parseJobRequirements, isOfficeCompletedJob, isOpenAmcServiceJob } from '@/lib/adminUtils';
import {
  applyOtpToRequirements,
  getStoredOtpFromRequirements,
  getSubmittedOtpForJob,
  markOtpRequestAnsweredForJob,
} from '@/lib/technicianOtpRequests';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { db, supabase, fetchCustomerIdsWithCompletedJobsMap } from '@/lib/supabase';
import { mapCustomerGstFields } from '@/lib/customerGst';
import {
  ensureSupabaseSessionForWrite,
  locationUploadErrorMessage,
  resolveSupabaseAccessTokenForApi,
} from '@/lib/ensureSupabaseSession';
import { useResumeSync } from '@/hooks/useResumeSync';
import { Job, JobAssignmentRequest } from '@/types';
import { sendNotification, createJobCompletedNotification, createJobAssignmentRequestNotification, createJobAssignmentAcceptedNotification, createJobAssignmentRejectedNotification, requestNotificationPermission } from '@/lib/notifications';
import FollowUpModal from '@/components/FollowUpModal';
import { registerTechnicianPWA, disablePWA, isPWAMode } from '@/lib/pwa';
import { markNativeBootReady } from '@/lib/nativeBootReady';
import {
  cacheQrCodes,
  cacheTechnicianQrCode,
  commonQrDisplaySrc,
  CommonQrCode,
  getTechnicianCommonQrImageCache,
  getTechnicianQrSnapshot,
  isDynamicUpiQr,
  isDynamicUpiTechnician,
  mapCommonQrRow,
  normalizeTechnicianAssignedCommonQrIds,
  prefetchTechnicianCommonQrImages,
  QR_NETWORK_MIN_INTERVAL_MS,
  saveTechnicianQrSnapshot,
  technicianHasPaymentQr,
  TechnicianQrPickerRow,
  TechnicianQrSnapshotV1,
} from '@/lib/qrCodeManager';
import DynamicUpiQrDisplay from '@/components/DynamicUpiQrDisplay';
import ShareQrLinkPanel, { SHARE_QR_LINK_VALUE } from '@/components/job/ShareQrLinkPanel';
import { useWhatsAppCloudApiGate } from '@/hooks/useWhatsAppCloudApiGate';
import { extractCoordinates, formatAddressForDisplay } from '@/lib/maps';
import { applyAutoMoveToOngoingOnDateFlag } from '@/lib/followUpToOngoing';
import ImageUpload from '@/components/ImageUpload';
import { Label } from '@/components/ui/label';
import { processQueuedPhotos, startRetryProcessing, setupOnlineListener, stopRetryProcessing } from '@/lib/retryPhotoUpload';
import { getQueuedPhotos, getQueuedPhotosCount } from '@/lib/offlinePhotoQueue';
import { withTimeout, isSlowNetworkError, isTimeoutError } from '@/lib/networkTimeout';
import TechnicianInventoryView from '@/components/TechnicianInventoryView';
import JobPartsUsedDialog from '@/components/admin/JobPartsUsedDialog';
import { AddReminderDialog } from '@/components/reminders/AddReminderDialog';
import { bangaloreAreas } from '@/lib/adminUtils';
import { customerNameClassName } from '@/lib/customerDisplay';
import {
  CustomerLocationVariant,
  getJobLocationDisplay,
  openJobServiceLocationInMapsAsync,
} from '@/lib/customer-locations';
import {
  TECHNICIAN_JOB_LIST_BROADCAST_CHANNEL,
  TECHNICIAN_JOB_LIST_BROADCAST_EVENT,
  type TechnicianJobListRefreshPayload,
} from '@/lib/technicianJobListSync';
import PendingPaymentFields from '@/components/job/PendingPaymentFields';
import {
  computePendingBalance,
  createPendingPaymentReminderFromJob,
  resolveDbPaymentMethodFromUi,
  resolveJobCustomerPaymentStatus,
  resolveReceivedCashAndOnline,
  upsertPendingPaymentInRequirements,
  validatePendingPaymentInputs,
  type PaidTodayMode,
} from '@/lib/jobPendingPayment';

/** Resolve the QR id stored on the job when tech uses Share QR Link mode. */
function resolveEffectiveQrCodeId(selectedQrCodeId: string, shareLinkUpiQrId: string): string {
  if (selectedQrCodeId === SHARE_QR_LINK_VALUE) {
    // shareLinkUpiQrId is already common_<id> or technician_<id>
    const v = String(shareLinkUpiQrId || '').trim();
    if (v.startsWith('common_') || v.startsWith('technician_')) return v;
    return v ? `common_${v}` : '';
  }
  if (!selectedQrCodeId || selectedQrCodeId === 'no-qr') return '';
  return selectedQrCodeId;
}
import { resolveJobBillingAmount } from '@/lib/jobAnalytics';
import { compareJobsByVisitOrder, getJobVisitOrder, getVisitOrderVisibleForTechnician } from '@/lib/adminVisitOrder';
import {
  aggregateCustomerPhotoUrls,
  collectAllPhotoUrlsFromJob,
  enrichJobsWithAfterPhotosIfNeeded,
  resolveCustomerUuidForQueries,
  resolveJobBillAndPaymentPhotos,
  mergeCompletedJobMissingPhotos,
  getCompletedJobMissingMedia,
} from '@/lib/jobReportPhotos';
import {
  billPhotosRequirement,
  type PhotoCaptureSource,
} from '@/lib/billPhotoCapture';
import {
  clearTechnicianCompleteJobDraft,
  friendlyCompletionErrorMessage,
  parseJobRequirementsArray,
  readTechnicianCompleteJobDraft,
  stripCompletionDraftMarkers,
  writeTechnicianCompleteJobDraft,
  type TechnicianCompleteJobDraft,
} from '@/lib/technicianCompleteJobDraft';
import AmcDocumentActions from '@/components/amc/AmcDocumentActions';
import {
  buildTechnicianReferenceAmcBill,
  suggestReferenceAmcBillNumber,
} from '@/lib/amc-reference-bill';
import {
  buildTechnicianAmcPersistPayload,
  persistAmcContract,
} from '@/lib/save-amc-contract';
import { normalizeCustomerAddress } from '@/lib/customer-address';
import { normalizeDocumentBrand, getDocumentBrandLabel, type DocumentBrand } from '@/lib/service-brands';
import { getTechnicianIdCardUrl } from '@/lib/technician-id-card';
import type { Customer } from '@/types';
import TechnicianCustomerUpdateDialog, {
  type TechnicianCustomerUpdatePatch,
} from '@/components/TechnicianCustomerUpdateDialog';
import CompletionFinishSection, {
  CompletionPhotoStep,
} from '@/components/technician/CompletionFinishSection';

/** Visible-tab poll (backup if postgres/broadcast miss). */
const TECH_JOBS_POLL_MS = 12_000;
/** Debounce full list refetch after sync ping / admin broadcast. */
const TECH_JOB_SYNC_DEBOUNCE_MS = 250;

// Calculate Levenshtein distance for fuzzy matching
const levenshteinDistance = (str1: string, str2: string): number => {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();
  const matrix: number[][] = [];

  for (let i = 0; i <= s2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= s1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= s2.length; i++) {
    for (let j = 1; j <= s1.length; j++) {
      if (s2.charAt(i - 1) === s1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[s2.length][s1.length];
};

// Calculate similarity score (0-1, where 1 is perfect match)
const calculateSimilarity = (str1: string, str2: string): number => {
  const maxLen = Math.max(str1.length, str2.length);
  if (maxLen === 0) return 1;
  const distance = levenshteinDistance(str1, str2);
  return 1 - distance / maxLen;
};



// Extract location from address string (same as admin dashboard)
const extractLocationFromAddressString = (completeAddress: string): string | null => {
  if (!completeAddress || completeAddress.trim().length === 0) {
    return null;
  }

  const uniqueAreas = [...new Set(bangaloreAreas)];
  
  const addressParts = completeAddress
    .split(/[,\s]+/)
    .map(part => part.trim())
    .filter(part => part.length > 2);

  // First, try exact matches
  for (const part of addressParts) {
    const partLower = part.toLowerCase();
    const exactMatch = uniqueAreas.find(area => 
      area.toLowerCase() === partLower
    );
    if (exactMatch) {
      return exactMatch;
    }
  }

  // Second, try multi-word exact matches
  for (let i = 0; i < addressParts.length - 1; i++) {
    const twoWordPart = `${addressParts[i]} ${addressParts[i + 1]}`.toLowerCase();
    const multiWordMatch = uniqueAreas.find(area => 
      area.toLowerCase() === twoWordPart
    );
    if (multiWordMatch) {
      return multiWordMatch;
    }
  }

  // Third, try strict partial matches
  for (const part of addressParts) {
    if (part.length < 5) continue;
    const partLower = part.toLowerCase();
    const partialMatch = uniqueAreas.find(area => {
      const areaLower = area.toLowerCase();
      if (areaLower.includes(partLower)) {
        return partLower.length >= areaLower.length * 0.7;
      }
      if (partLower.includes(areaLower)) {
        return areaLower.length >= partLower.length * 0.7;
      }
      return false;
    });
    if (partialMatch) {
      return partialMatch;
    }
  }

  // Last resort: fuzzy matching
  let bestMatch: string | null = null;
  let bestScore = 0.85;

  for (const part of addressParts) {
    if (part.length < 6) continue;

    for (const area of uniqueAreas) {
      const lengthDiff = Math.abs(area.length - part.length) / Math.max(area.length, part.length);
      if (lengthDiff > 0.3) continue;

      const similarity = calculateSimilarity(part, area);
      
      if (similarity > bestScore) {
        bestScore = similarity;
        bestMatch = area;
      }
    }
  }

  return bestMatch;
};

type ServiceBrand = 'elevenro' | 'hydrogenro';

const normalizeServiceBrand = (value: unknown): ServiceBrand | null => {
  if (typeof value !== 'string') return null;
  // Normalize common variations like "HydrogenRO", "Hydrogen RO", "hydrogen_ro", etc.
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '');
  if (normalized === 'elevenro' || normalized === 'hydrogenro') return normalized;
  return null;
};

const getServiceBrandLabel = (brand: ServiceBrand) => (brand === 'elevenro' ? 'ElevenRO' : 'HydrogenRO');

// Normalize job statuses coming from DB (handles casing differences).
const normalizeJobStatus = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'string') return String(value);
  return value.trim().toUpperCase().replace(/\s+/g, '_');
};

const ONGOING_JOB_STATUSES = ['PENDING', 'ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS'] as const;

const isOngoingJob = (job: Job): boolean => {
  const status = normalizeJobStatus((job as { status?: unknown }).status ?? job.status);
  return (ONGOING_JOB_STATUSES as readonly string[]).includes(status);
};

/** Keep completed/denied rows when refreshing only active + follow-up (poll on Ongoing). */
function mergeActiveDashboardJobRefresh(existing: Job[], incoming: Job[]): Job[] {
  const byId = new Map<string, Job>();
  for (const j of existing) {
    const st = normalizeJobStatus((j as { status?: unknown }).status ?? j.status);
    if (st === 'COMPLETED' || st === 'DENIED') byId.set(j.id, j);
  }
  for (const j of incoming) byId.set(j.id, j);
  return Array.from(byId.values());
}

/** Main square color for AMC / Google review / prior (returning) customer — Technician lists. Blue only when no AMC and no Google review (green/red/orange unchanged). */
function technicianCustomerIndicatorMainClass(hasAmc: boolean, hasG: boolean, hasPrior: boolean): string {
  if (hasAmc && hasG) return 'bg-orange-500 ring-2 ring-orange-300 shadow-[0_0_12px_rgba(249,115,22,0.9)]';
  if (hasAmc) return 'bg-green-500';
  if (hasG) return 'bg-red-500';
  if (hasPrior && !hasAmc && !hasG) return 'bg-blue-500';
  return 'bg-gray-400';
}

/** Bust browser/CDN cache for remote QR images after admin replaces asset (same URL possible). */
function appendQrCacheBust(url: string, version: number): string {
  if (!url || version <= 0) return url;
  if (url.startsWith('data:') || url.startsWith('blob:')) return url;
  if (!url.startsWith('http://') && !url.startsWith('https://')) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}ro_qr_v=${version}`;
}

/** In-memory QR state for Realtime merges (avoid 4-query refetch on every admin edit). */
type TechnicianQrLiveRef = {
  technicianId: string;
  allCommon: CommonQrCode[];
  technicianCommonFull: CommonQrCode[];
  allTechPicker: TechnicianQrPickerRow[];
  visibleForPicker: string[];
  rawVisibleQrCodes: string[] | null | undefined;
  assignedCommonIds: string[];
  allTechForReports: TechnicianQrSnapshotV1['allTechniciansForReports'];
  /** True after first successful loadQrCodes — skip merge until then to avoid partial state. */
  hydrated: boolean;
};

function emptyTechnicianQrLiveRef(): TechnicianQrLiveRef {
  return {
    technicianId: '',
    allCommon: [],
    technicianCommonFull: [],
    allTechPicker: [],
    visibleForPicker: ['all'],
    rawVisibleQrCodes: undefined,
    assignedCommonIds: [],
    allTechForReports: [],
    hydrated: false,
  };
}

/**
 * Allow only a clean money string: digits + at most one '.'. Strips commas,
 * spaces, currency symbols, and trailing letters like "rs". Empty stays
 * empty. Used by bill / partial-cash / partial-online inputs to stop typos
 * like "1,200", "12.5.0", or "1200rs" from entering state and being saved
 * to the server. (#6)
 */
function sanitizeMoneyInput(raw: string): string {
  if (raw == null) return '';
  // Drop everything except digits and dots.
  let cleaned = String(raw).replace(/[^0-9.]/g, '');
  // Collapse multiple dots: keep only the first.
  const firstDot = cleaned.indexOf('.');
  if (firstDot !== -1) {
    cleaned =
      cleaned.slice(0, firstDot + 1) +
      cleaned.slice(firstDot + 1).replace(/\./g, '');
  }
  // Cap to 2 decimals so partial cash/online don't drift below paise.
  const dotIdx = cleaned.indexOf('.');
  if (dotIdx !== -1 && cleaned.length - dotIdx - 1 > 2) {
    cleaned = cleaned.slice(0, dotIdx + 3);
  }
  return cleaned;
}

/**
 * Parse a sanitized money string. Returns NaN if not a finite non-negative
 * number. Callers MUST treat NaN as "invalid input" rather than silently
 * substituting 0 (which is what `parseFloat('1,200rs') || 0 === 1` did).
 */
function parseMoneyAmount(raw: string): number {
  if (raw == null) return NaN;
  const trimmed = String(raw).trim();
  if (trimmed === '') return NaN;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return NaN;
  return n;
}

// Customer search + job creation are code-split — loaded only when opened.
const TechnicianCustomerSearchDialog = React.lazy(
  () => import('@/components/technician/TechnicianCustomerSearchDialog')
);
const TechnicianNewJobDialog = React.lazy(() => import('@/components/admin/NewJobDialog'));

const TechnicianDashboard = () => {
  const { cloudApiOn: whatsappCloudApiOn } = useWhatsAppCloudApiGate('pending_payment');
  const { user, logout, isTechnician, authInitializing } = useAuth();
  const [authGraceExpired, setAuthGraceExpired] = useState(false);
  const navigate = useNavigate();

  // Legacy: offline job-completion queue removed; clear stale drafts from older builds.
  useEffect(() => {
    try {
      localStorage.removeItem('offline_job_completions');
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    preloadLeadCatalog();
  }, []);

  const [jobs, setJobs] = useState<Job[]>([]);
  const [filteredJobs, setFilteredJobs] = useState<Job[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false); // Start as false to prevent flash
  const [customerAMCStatus, setCustomerAMCStatus] = useState<Record<string, boolean>>({}); // Map customer ID to hasActiveAMC
  const [customerPriorServiceStatus, setCustomerPriorServiceStatus] = useState<Record<string, boolean>>({}); // ≥1 completed job (returning)
  const [customerLastServiceBrand, setCustomerLastServiceBrand] = useState<Record<string, ServiceBrand | null>>({});
  const loadedLastBrandCustomerIdsRef = useRef<Set<string>>(new Set());
  const techCustomerHasPriorService = useCallback(
    (customer: any, opts?: { excludeJobId?: string }) => {
      const cid = customer?.id;
      if (!cid) return false;
      if (customerPriorServiceStatus[cid]) return true;
      if (customer?.last_service_date ?? customer?.lastServiceDate) return true;
      const excludeJobId = opts?.excludeJobId;
      return jobs.some((j) => {
        const jcid = (j as any).customer_id || (j.customer as any)?.id;
        if (jcid !== cid) return false;
        if (excludeJobId && j.id === excludeJobId) return false;
        const st = (j as any).status || j.status;
        return st === 'COMPLETED';
      });
    },
    [customerPriorServiceStatus, jobs]
  );
  const [amcInfoDialogOpen, setAmcInfoDialogOpen] = useState(false);
  const [selectedCustomerForAMC, setSelectedCustomerForAMC] = useState<{id: string, name: string} | null>(null);
  const [amcInfo, setAmcInfo] = useState<any>(null);
  const [loadingAMCInfo, setLoadingAMCInfo] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const processingJobsRef = useRef<Set<string>>(new Set()); // Track jobs being processed to prevent duplicates (use ref for synchronous access)
  /** Throttle rare full QR refetch when returning to the app (Realtime merge is primary). */
  const lastQrRefreshOnFocusRef = useRef<number>(0);
  const qrLiveRef = useRef<TechnicianQrLiveRef>(emptyTechnicianQrLiveRef());
  /** Avoid repeated `loadQrCodes({ force })` on every deps tick while staying on payment step; still refresh on step entry or bill becoming eligible. */
  const qrPaymentStepPrevStepRef = useRef<number | null>(null);
  const qrPaymentStepHadBillRef = useRef(false);
  const lastJobIdsRef = useRef<Set<string>>(new Set()); // Track job IDs from last active session
  const hasJobsRef = useRef<boolean>(false); // Track if we have loaded jobs at least once
  const shouldPreserveOrderRef = useRef<boolean>(false); // Track if we should preserve job order (true when updating status, false when loading from DB)
  // Freezes the ongoing list's on-screen order for the session (e.g. after the tech taps
  // Start) so jobs don't jump to the top mid-work, even across realtime refetches. Null on
  // a fresh page load, so the default sort (active jobs on top) applies after a reload.
  // Reset on tab change and when acknowledging new jobs.
  const ongoingOrderRef = useRef<string[] | null>(null);
  const prevStatusFilterForOrderRef = useRef<string>('');
  const lastCompletedJobIdsOrderRef = useRef<string[]>([]); // Completed tab: preserve list order when only job data changes (e.g. add parts)
  const lastCompletedDateFilterRef = useRef<'today' | 'yesterday'>('today'); // so we re-sort when switching today/yesterday
  const jobsRef = useRef<Job[]>([]); // Track current jobs state for synchronous access in realtime handler
  // Load seenJobs from localStorage on mount
  const [seenJobs, setSeenJobs] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('technician_seen_jobs');
      if (stored) {
        const parsed = JSON.parse(stored);
        return new Set(Array.isArray(parsed) ? parsed : []);
      }
    } catch (error) {
      console.error('Error loading seen jobs from localStorage:', error);
    }
    return new Set();
  }); // Track jobs that have been interacted with (to remove blue border)
  // Blocking "you have N new job(s)" alert so newly assigned jobs can't get buried.
  const [newJobsAlertOpen, setNewJobsAlertOpen] = useState(false);
  const [confirmStartJobDialog, setConfirmStartJobDialog] = useState<{open: boolean, job: Job | null}>({open: false, job: null});
  const [confirmStartWorkDialog, setConfirmStartWorkDialog] = useState<{open: boolean, job: Job | null}>({open: false, job: null});
  /** Maps tap: ask "going now?" before Start job — skipped if already EN_ROUTE / IN_PROGRESS. */
  const [mapsGoingDialog, setMapsGoingDialog] = useState<{ open: boolean; job: Job | null }>({
    open: false,
    job: null,
  });
  // Customer OTP asked right at Start Work (Home Triangle / OTP-required jobs).
  const [startWorkOtp, setStartWorkOtp] = useState('');
  const [startWorkOtpError, setStartWorkOtpError] = useState('');
  const [visitOrderSkipDialog, setVisitOrderSkipDialog] = useState<{
    open: boolean;
    job: Job | null;
    action: 'start' | 'startWork' | 'startAndOpenMap' | null;
    rank: number;
    firstJob: Job | null;
  }>({ open: false, job: null, action: null, rank: 0, firstJob: null });
  /** Admin Tools → Arrange order per-technician switch (default off). */
  const [visitOrderVisible, setVisitOrderVisible] = useState(false);
  const [confirmCompleteJobDialog, setConfirmCompleteJobDialog] = useState<{open: boolean, job: Job | null}>({open: false, job: null});
  const [statusFilter, setStatusFilter] = useState<'ONGOING' | 'PENDING' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'RESCHEDULED'>('ONGOING');
  const statusFilterRef = useRef(statusFilter);
  statusFilterRef.current = statusFilter;
  const [completedDateFilter, setCompletedDateFilter] = useState<'today' | 'yesterday'>('today');
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [jobNotes, setJobNotes] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  // Job Assignment Requests state
  const [assignmentRequests, setAssignmentRequests] = useState<JobAssignmentRequest[]>([]);
  const [assignmentRequestsLoading, setAssignmentRequestsLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<JobAssignmentRequest | null>(null);
  const [responseNotes, setResponseNotes] = useState('');
  const [isResponding, setIsResponding] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<{lat: number, lng: number} | null>(null);
  const [currentLocationAccuracyM, setCurrentLocationAccuracyM] = useState<number | null>(null);
  const [distances, setDistances] = useState<{[jobId: string]: number}>({});
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationErrorType, setLocationErrorType] = useState<'permission' | 'upload' | 'location' | 'other' | null>(null);
  const [locationPermissionDenied, setLocationPermissionDenied] = useState(false);

  // Follow-up functionality state
  const [followUpModalOpen, setFollowUpModalOpen] = useState(false);
  const [selectedJobForFollowUp, setSelectedJobForFollowUp] = useState<Job | null>(null);
  const [denyDialogOpen, setDenyDialogOpen] = useState(false);
  // Move to ongoing dialog state
  const [moveToOngoingDialogOpen, setMoveToOngoingDialogOpen] = useState(false);
  const [selectedJobForMoveToOngoing, setSelectedJobForMoveToOngoing] = useState<Job | null>(null);
  const [moveToOngoingDate, setMoveToOngoingDate] = useState<string>('');
  const [moveToOngoingTime, setMoveToOngoingTime] = useState<string>('');
  const [moveToOngoingTimeSlot, setMoveToOngoingTimeSlot] = useState<'MORNING' | 'AFTERNOON' | 'EVENING' | 'CUSTOM'>('MORNING');
  const [moveToOngoingCustomTime, setMoveToOngoingCustomTime] = useState<string>('');
  // Options dialog state for 3-dot menu
  const [optionsDialogOpen, setOptionsDialogOpen] = useState<{[jobId: string]: boolean}>({});
  const [selectedJobForOptions, setSelectedJobForOptions] = useState<Job | null>(null);
  /** Post-complete: add missing bill photo or payment screenshot via 3-dot menu. */
  const [missingPhotoDialog, setMissingPhotoDialog] = useState<{
    job: Job;
    kind: 'bill' | 'payment';
  } | null>(null);
  const [missingPhotoUrls, setMissingPhotoUrls] = useState<string[]>([]);
  const [missingPhotoSources, setMissingPhotoSources] = useState<Record<string, PhotoCaptureSource>>({});
  const [missingPhotoUploading, setMissingPhotoUploading] = useState(false);
  const [missingPhotoSaving, setMissingPhotoSaving] = useState(false);
  // Customer search (Options menu) + technician job creation
  const [customerSearchDialogOpen, setCustomerSearchDialogOpen] = useState(false);
  const [techNewJobCustomer, setTechNewJobCustomer] = useState<Record<string, unknown> | null>(null);
  // Customer report dialog state
  const [customerReportDialogOpen, setCustomerReportDialogOpen] = useState(false);
  const [selectedCustomerForReport, setSelectedCustomerForReport] = useState<any>(null);
  const [customerReportJobs, setCustomerReportJobs] = useState<any[]>([]);
  const [loadingCustomerReportJobs, setLoadingCustomerReportJobs] = useState(false);
  const [partsUsedDialogOpen, setPartsUsedDialogOpen] = useState(false);
  const [selectedJobForParts, setSelectedJobForParts] = useState<Job | null>(null);
  const [addReminderDialogOpen, setAddReminderDialogOpen] = useState(false);
  const [reminderEntity, setReminderEntity] = useState<{ type: 'customer' | 'job' | 'general'; id: string | null }>({ type: 'general', id: null });
  const [reminderContextLabel, setReminderContextLabel] = useState<string>('');
  useEffect(() => {
    document.title = 'Eleven RO Technician';
    registerTechnicianPWA();

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

  const [selectedJobForDeny, setSelectedJobForDeny] = useState<Job | null>(null);
  const [denyReason, setDenyReason] = useState('');
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
  const [completionNotes, setCompletionNotes] = useState('');
  const [completeJobStep, setCompleteJobStep] = useState<1 | 2 | 3 | 4 | 5 | 6 | 7>(1);
  const completeJobScrollRef = useRef<HTMLDivElement>(null);
  const [billAmount, setBillAmount] = useState<string>('');
  const [billPhotos, setBillPhotos] = useState<string[]>([]);
  const [billPhotoSources, setBillPhotoSources] = useState<Record<string, PhotoCaptureSource>>({});
  const [otpInput, setOtpInput] = useState<string[]>(['', '', '', '']);
  const [otpError, setOtpError] = useState<string>('');
  const [serviceBrand, setServiceBrand] = useState<ServiceBrand | null>(null);
  const [lastServiceBrand, setLastServiceBrand] = useState<ServiceBrand | null>(null);
  const [isLoadingServiceBrand, setIsLoadingServiceBrand] = useState(false);
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [amcDateGiven, setAmcDateGiven] = useState<string>('');
  const [amcEndDate, setAmcEndDate] = useState<string>('');
  const [amcYears, setAmcYears] = useState<number>(0);
  const [amcIncludesPrefilter, setAmcIncludesPrefilter] = useState<boolean | null>(null);
  const [amcAdditionalInfo, setAmcAdditionalInfo] = useState<string>('');
  const [amcAmount, setAmcAmount] = useState<string>('');
  const [amcServicePeriodKind, setAmcServicePeriodKind] = useState<'' | '4' | '6' | 'custom' | 'no_auto'>('');
  const [amcServicePeriodCustomMonths, setAmcServicePeriodCustomMonths] = useState<number>(4);
  const [hasAMC, setHasAMC] = useState<boolean | null>(null);
  const [completeJobCustomerDoc, setCompleteJobCustomerDoc] = useState<Customer | null>(null);
  const [paymentMode, setPaymentMode] = useState<'CASH' | 'ONLINE' | 'PARTIAL' | 'PENDING_PAYMENT' | ''>('');
  const [billAmountConfirmOpen, setBillAmountConfirmOpen] = useState(false);
  const [billPhotosSkipConfirmOpen, setBillPhotosSkipConfirmOpen] = useState(false);
  const [customerHasPrefilter, setCustomerHasPrefilter] = useState<boolean | null>(null);
  const [rawWaterTds, setRawWaterTds] = useState<string>('');
  const [qrCodeType, setQrCodeType] = useState<string>('');
  const [selectedQrCodeId, setSelectedQrCodeId] = useState<string>('');
  /** When Select QR = Share QR Link, which Dynamic UPI common QR to use. */
  const [shareLinkUpiQrId, setShareLinkUpiQrId] = useState<string>('');
  const [commonQrCodes, setCommonQrCodes] = useState<CommonQrCode[]>([]);
  const [allCommonQrCodes, setAllCommonQrCodes] = useState<CommonQrCode[]>([]); // Store all QR codes
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [allTechnicians, setAllTechnicians] = useState<any[]>([]); // Store all technicians (filtered for QR codes)
  const [allTechniciansForReports, setAllTechniciansForReports] = useState<any[]>([]); // Store ALL technicians for reports lookup
  const [technicianVisibleQrCodes, setTechnicianVisibleQrCodes] = useState<string[]>([]); // Current technician's visibility settings
  const [selectedQrCodeName, setSelectedQrCodeName] = useState<string>('');
  const [selectedQrCodeUrlState, setSelectedQrCodeUrlState] = useState<string>('');
  const [paymentScreenshot, setPaymentScreenshot] = useState<string>('');
  const [partialCashAmount, setPartialCashAmount] = useState<string>('');
  const [partialOnlineAmount, setPartialOnlineAmount] = useState<string>('');
  const [pendingPaidTodayEnabled, setPendingPaidTodayEnabled] = useState(false);
  const [pendingPaidTodayMode, setPendingPaidTodayMode] = useState<PaidTodayMode | ''>('');
  const [pendingPaidTodayAmount, setPendingPaidTodayAmount] = useState('');
  const [promisedPaymentDate, setPromisedPaymentDate] = useState('');
  const [isSubmittingJobCompletion, setIsSubmittingJobCompletion] = useState(false);
  const [isBillPhotosUploading, setIsBillPhotosUploading] = useState(false);
  const [isPaymentScreenshotUploading, setIsPaymentScreenshotUploading] = useState(false);
  const [optionalCompletionPhotos, setOptionalCompletionPhotos] = useState<string[]>([]);
  /** Ask for optional job photos only when this customer has zero photos across profile + all jobs. */
  const [customerHasZeroPhotosAltogether, setCustomerHasZeroPhotosAltogether] = useState(false);
  const [isOptionalCompletionPhotosUploading, setIsOptionalCompletionPhotosUploading] = useState(false);
  const [extraPhotosStep6, setExtraPhotosStep6] = useState<string[]>([]);
  const [dontSendMessageToCustomer, setDontSendMessageToCustomer] = useState(false);
  const [askForReview, setAskForReview] = useState(true);
  const [isExtraPhotosStep6Uploading, setIsExtraPhotosStep6Uploading] = useState(false);
  const [completionSubmitError, setCompletionSubmitError] = useState<string | null>(null);
  const [completionRetryPhaseBOnly, setCompletionRetryPhaseBOnly] = useState(false);
  const [resumeCompleteJobDraftOpen, setResumeCompleteJobDraftOpen] = useState(false);
  const [completeJobDraftToResume, setCompleteJobDraftToResume] = useState<TechnicianCompleteJobDraft | null>(null);
  const amcContractPersistedKeyRef = useRef<string | null>(null);

  // Phone popup state
  const [phonePopupOpen, setPhonePopupOpen] = useState(false);
  const [selectedCustomerPhone, setSelectedCustomerPhone] = useState<{
    phone: string;
    alternate_phone?: string;
    full_name?: string;
    customer_tier?: string | null;
  } | null>(null);
  const [whatsappNumberDialogOpen, setWhatsappNumberDialogOpen] = useState(false);
  const [selectedCustomerForWhatsApp, setSelectedCustomerForWhatsApp] = useState<{
    phone: string;
    alternate_phone?: string;
    full_name?: string;
    customer_tier?: string | null;
  } | null>(null);

  // Header 3-dot menu → centered options dialog
  const [headerOptionsDialogOpen, setHeaderOptionsDialogOpen] = useState(false);
  // Technician ID Card QR Code Dialog
  const [technicianIdCardDialogOpen, setTechnicianIdCardDialogOpen] = useState(false);
  const [selectedIdCardBrand, setSelectedIdCardBrand] = useState<DocumentBrand | null>(null);
  const [inventoryDialogOpen, setInventoryDialogOpen] = useState(false);
  // Monthly Billing Dialog
  const [billingDialogOpen, setBillingDialogOpen] = useState(false);
  const [billingMonth, setBillingMonth] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingJobs, setBillingJobs] = useState<any[]>([]);
  // Common QRs (assigned by admin, shown below payment QR) - multiple allowed
  const [commonQrCodesForTechnician, setCommonQrCodesForTechnician] = useState<CommonQrCode[]>([]);
  const [commonQrDialogOpen, setCommonQrDialogOpen] = useState(false);
  const [expandedCommonQr, setExpandedCommonQr] = useState<CommonQrCode | null>(null);
  /** Data URLs for assigned Common QRs — filled while online for offline image display. */
  const [commonQrImageDataById, setCommonQrImageDataById] = useState<Record<string, string>>({});
  /** Incremented after each successful online QR snapshot fetch so remote <img> URLs refresh. */
  const [qrAssetsVersion, setQrAssetsVersion] = useState(0);

  // Photos dialog state
  const [photosDialogOpen, setPhotosDialogOpen] = useState(false);
  const [selectedJobPhotos, setSelectedJobPhotos] = useState<{jobId: string, photos: string[], customerId?: string} | null>(null);
  const [loadingCustomerPhotos, setLoadingCustomerPhotos] = useState(false);

  // Photo viewer — completed jobs, job gallery, and customer report
  const [photoViewerOpen, setPhotoViewerOpen] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<{url: string, index: number, total: number} | null>(null);
  const [selectedBillPhotos, setSelectedBillPhotos] = useState<string[]>([]);
  const reportDialogScrollRef = useRef<HTMLDivElement>(null);
  const galleryDialogScrollRef = useRef<HTMLDivElement>(null);
  const suspendedDialogRef = useRef<{ type: 'report' | 'gallery'; scrollTop: number } | null>(null);
  const skipNextReportFetchRef = useRef(false);

  type TechnicianJobPhotos = { jobId: string; photos: string[]; customerId?: string };

  const openPhotoViewerSuspended = useCallback(
    (
      suspendType: 'report' | 'gallery',
      photos: string[],
      index: number,
      opts?: { jobPhotosMeta?: TechnicianJobPhotos | null },
    ) => {
      if (!photos.length) return;
      const safeIndex = Math.min(Math.max(0, index), photos.length - 1);
      const scrollEl =
        suspendType === 'report' ? reportDialogScrollRef.current : galleryDialogScrollRef.current;
      suspendedDialogRef.current = {
        type: suspendType,
        scrollTop: scrollEl?.scrollTop ?? 0,
      };

      if (suspendType === 'report') {
        skipNextReportFetchRef.current = true;
        setCustomerReportDialogOpen(false);
      } else {
        setPhotosDialogOpen(false);
      }

      window.setTimeout(() => {
        if (opts?.jobPhotosMeta) {
          setSelectedJobPhotos(opts.jobPhotosMeta);
          setSelectedBillPhotos([]);
        } else {
          setSelectedBillPhotos(photos);
          setSelectedJobPhotos(null);
        }
        setSelectedPhoto({
          url: photos[safeIndex],
          index: safeIndex,
          total: photos.length,
        });
        setPhotoViewerOpen(true);
      }, 50);
    },
    [],
  );

  const restoreDialogScroll = useCallback((el: HTMLDivElement | null, scrollTop: number) => {
    if (!el) return;
    const apply = () => {
      el.scrollTop = scrollTop;
    };
    requestAnimationFrame(() => {
      apply();
      requestAnimationFrame(apply);
    });
  }, []);

  const closePhotoViewer = useCallback(() => {
    const suspended = suspendedDialogRef.current;
    setPhotoViewerOpen(false);
    setSelectedPhoto(null);
    setSelectedBillPhotos([]);

    if (!suspended) {
      setSelectedJobPhotos(null);
      return;
    }

    suspendedDialogRef.current = null;
    const { type, scrollTop } = suspended;

    if (type === 'report') {
      skipNextReportFetchRef.current = true;
      setCustomerReportDialogOpen(true);
      window.setTimeout(() => restoreDialogScroll(reportDialogScrollRef.current, scrollTop), 80);
      return;
    }

    setPhotosDialogOpen(true);
    window.setTimeout(() => restoreDialogScroll(galleryDialogScrollRef.current, scrollTop), 80);
  }, [restoreDialogScroll]);

  const goToPreviousPhoto = useCallback(() => {
    if (!selectedPhoto) return;
    const photos = resolveAdminPhotoViewerSources({
      selectedBillPhotos,
      selectedCustomerPhotos: null,
      selectedJobPhotos: selectedJobPhotos
        ? { photos: selectedJobPhotos.photos }
        : null,
    });
    if (!photos?.length) return;
    setSelectedPhoto(buildAdminPhotoViewerSelection(photos, 'prev', selectedPhoto));
  }, [selectedPhoto, selectedBillPhotos, selectedJobPhotos]);

  const goToNextPhoto = useCallback(() => {
    if (!selectedPhoto) return;
    const photos = resolveAdminPhotoViewerSources({
      selectedBillPhotos,
      selectedCustomerPhotos: null,
      selectedJobPhotos: selectedJobPhotos
        ? { photos: selectedJobPhotos.photos }
        : null,
    });
    if (!photos?.length) return;
    setSelectedPhoto(buildAdminPhotoViewerSelection(photos, 'next', selectedPhoto));
  }, [selectedPhoto, selectedBillPhotos, selectedJobPhotos]);

  // Address dialog state
  const [addressDialogOpen, setAddressDialogOpen] = useState<{[jobId: string]: boolean}>({});
  const [selectedJobForAddress, setSelectedJobForAddress] = useState<Job | null>(null);
  const [addressLocationVariant, setAddressLocationVariant] = useState<
    Record<string, CustomerLocationVariant>
  >({});
  const [selectedCustomerForLocations, setSelectedCustomerForLocations] = useState<Customer | null>(null);
  const [customerUpdateDialogJob, setCustomerUpdateDialogJob] = useState<Job | null>(null);
  const [mapOpeningByJobId, setMapOpeningByJobId] = useState<Record<string, boolean>>({});

  const openJobAddressDialog = useCallback((job: Job, variant: CustomerLocationVariant = 'primary') => {
    setSelectedJobForAddress(job);
    setAddressLocationVariant((prev) => ({ ...prev, [job.id]: variant }));
    setAddressDialogOpen((prev) => ({ ...prev, [job.id]: true }));
  }, []);

  const loadJobCustomerForLocation = useCallback(async (job: Job): Promise<Customer> => {
    const embedded = (job.customer || {}) as Customer;
    const customerId = (embedded as any)?.id || (job as any)?.customer_id;
    if (!customerId) return embedded;
    const { data, error } = await db.customers.getById(String(customerId));
    if (!error && data) return data as Customer;
    return embedded;
  }, []);

  const handleTechnicianLocationLabelClick = useCallback(
    async (job: Job) => {
      const t = toast.loading('Loading…');
      try {
        const customer = await loadJobCustomerForLocation(job);
        setSelectedCustomerForLocations(customer);
        const { variant } = getJobLocationDisplay(job, customer);
        openJobAddressDialog(job, variant);
      } finally {
        toast.dismiss(t);
      }
    },
    [loadJobCustomerForLocation, openJobAddressDialog]
  );

  const openMapForJobDirect = useCallback(
    async (job: any) => {
      const jobId = String(job?.id || '');
      if (!jobId) {
        toast.error('Location data not available');
        return;
      }

      setMapOpeningByJobId((prev) => ({ ...prev, [jobId]: true }));
      const t = toast.loading('Loading location…');
      try {
        const customerRow = await loadJobCustomerForLocation(job as Job);
        if (await openJobServiceLocationInMapsAsync(job, customerRow)) {
          return;
        }
        toast.error('Location data not available');
      } finally {
        toast.dismiss(t);
        setMapOpeningByJobId((prev) => ({ ...prev, [jobId]: false }));
      }
    },
    [loadJobCustomerForLocation]
  );

  /**
   * Maps / Google location tap. If already EN_ROUTE or IN_PROGRESS, open Maps
   * immediately (no re-prompt). Otherwise ask whether they're going now;
   * Yes → Start job (admin push) then Maps; No → Maps only.
   */
  const openMapForJob = useCallback(
    async (job: any) => {
      const jobId = String(job?.id || '');
      if (!jobId) {
        toast.error('Location data not available');
        return;
      }
      const status = normalizeJobStatus((job as any)?.status ?? job?.status);
      if (status === 'EN_ROUTE' || status === 'IN_PROGRESS') {
        await openMapForJobDirect(job);
        return;
      }
      if (status === 'ASSIGNED' || status === 'PENDING') {
        setMapsGoingDialog({ open: true, job: job as Job });
        return;
      }
      await openMapForJobDirect(job);
    },
    [openMapForJobDirect]
  );

  // Define loadAssignedJobs before useEffect hooks that use it
  const hydrateCustomerPriorServiceFlags = useCallback(async (customerIds: string[]) => {
    const ids = Array.from(new Set((customerIds || []).filter(Boolean)));
    if (ids.length === 0) return;

    try {
      const [lastServiceRes, completedRes] = await Promise.all([
        db.customers.getLastServiceDateFlags(ids),
        db.jobs.getCustomerIdsWithCompletedAmong(ids),
      ]);

      const merged: Record<string, boolean> = {};
      if (lastServiceRes.data) Object.assign(merged, lastServiceRes.data);
      if (completedRes.data) Object.assign(merged, completedRes.data);

      if (Object.keys(merged).length > 0) {
        setCustomerPriorServiceStatus((prev) => ({ ...prev, ...merged }));
      }
    } catch (e) {
      console.warn('[TechnicianDashboard] hydrateCustomerPriorServiceFlags failed:', e);
    }
  }, []);

  const dashboardHistoryLoadedRef = useRef(false);
  const completedPhotosEnrichedRef = useRef(false);

  const loadCustomerLastServiceBrands = useCallback(async (customerIds: string[]) => {
    const uniqueIds = Array.from(new Set((customerIds || []).filter(Boolean)));
    const missingIds = uniqueIds.filter((id) => !loadedLastBrandCustomerIdsRef.current.has(id));
    if (missingIds.length === 0) return;

    missingIds.forEach((id) => loadedLastBrandCustomerIdsRef.current.add(id));

    try {
      const { data: brandByCustomer, error } = await db.jobs.getLastServiceBrandByCustomerIds(missingIds);
      if (error) {
        console.warn('[TechnicianDashboard] Failed to load last service brands:', error);
        return;
      }

      const results: Record<string, ServiceBrand | null> = {};
      for (const customerId of missingIds) {
        results[customerId] = normalizeServiceBrand(brandByCustomer?.[customerId]);
      }
      setCustomerLastServiceBrand((prev) => ({ ...prev, ...results }));
    } catch (err) {
      console.warn('[TechnicianDashboard] Error loading last service brands:', err);
    }
  }, []);

  const enrichCompletedJobsInList = useCallback(async (jobList: Job[]) => {
    const completed = jobList.filter(
      (j) => normalizeJobStatus((j as { status?: unknown }).status ?? j.status) === 'COMPLETED'
    );
    if (completed.length === 0) return jobList;
    try {
      const enriched = await enrichJobsWithAfterPhotosIfNeeded(completed);
      const byId = new Map(enriched.map((j) => [j.id, j]));
      return jobList.map((j) => (byId.has(j.id) ? (byId.get(j.id) as Job) : j));
    } catch {
      return jobList;
    }
  }, []);

  const loadAssignedJobs = useCallback(async (
    retryCount = 0,
    loadOpts?: { activeOnly?: boolean }
  ) => {
    if (!user?.technicianId) return;

    const activeOnly = loadOpts?.activeOnly === true;

    try {
      // Only show loading if we haven't loaded jobs before (first load)
      if (!hasJobsRef.current) {
        setJobsLoading(true);
      }
      const loadStartedAt = import.meta.env.DEV ? performance.now() : 0;

      const { data, error } = await db.jobs.getByTechnicianIdForDashboard(user.technicianId, {
        activeOnly,
      });
      
      if (error) {
        console.error('Error loading assigned jobs:', error);
        // Retry on network errors (up to 2 retries)
        if (retryCount < 2 && (error.message.includes('fetch') || error.message.includes('network') || error.message.includes('Failed to fetch') || error.message.includes('timeout') || error.message.includes('AbortError'))) {
          console.log(`Retrying loadAssignedJobs (attempt ${retryCount + 1}/2)...`);
          await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1))); // Exponential backoff
          return loadAssignedJobs(retryCount + 1);
        }
        throw new Error(error.message);
      }

      let allJobs: Job[] = [];
      const newAssignedJobs: Job[] = [];
      const statusCounts: Record<string, number> = {};

      if (activeOnly && hasJobsRef.current && jobsRef.current.length > 0) {
        allJobs = mergeActiveDashboardJobRefresh(jobsRef.current, (data || []) as Job[]);
      } else if (data && data.length > 0) {
        (data as Job[]).forEach((job: Job) => {
          allJobs.push(job);
        });
      }

      for (const job of allJobs) {
        const status = (job as any).status || job.status || 'UNKNOWN';
        statusCounts[status] = (statusCounts[status] || 0) + 1;
        if (status === 'ASSIGNED') newAssignedJobs.push(job);
      }

      if (
        !activeOnly &&
        statusFilterRef.current === 'COMPLETED' &&
        allJobs.some((j) => normalizeJobStatus((j as any).status ?? j.status) === 'COMPLETED')
      ) {
        allJobs = await enrichCompletedJobsInList(allJobs);
      }

      const ongoingJobs = allJobs.filter(isOngoingJob);

      if (import.meta.env.DEV) {
        const ms = Math.round(performance.now() - loadStartedAt);
        console.log(`📊 Jobs loaded (${ms}ms): ${allJobs.length} rows for dashboard`, {
          ongoing: ongoingJobs.length,
          statusBreakdown: statusCounts,
        });
      }
      
      // Mark that we should sort (loading from database)
      shouldPreserveOrderRef.current = false;
      setJobs(allJobs);
      jobsRef.current = allJobs; // Update ref for synchronous access
      hasJobsRef.current = true; // Mark that we've loaded jobs at least once
      setJobsLoading(false); // Show jobs immediately, don't wait for AMC

      setCustomerPriorServiceStatus((prev) => {
        const next = { ...prev };
        for (const j of allJobs) {
          const cid = (j as any).customer_id || (j.customer as any)?.id;
          if (!cid) continue;
          const st = (j as any).status || j.status;
          if (st === 'COMPLETED') next[cid] = true;
          const c = j.customer as any;
          if (c?.last_service_date || c?.lastServiceDate) next[cid] = true;
        }
        return next;
      });

      // Prefetch "last served as" brand for returning customers to show it on the cards.
      const priorCustomerIds = new Set<string>();
      for (const j of allJobs) {
        const cid = (j as any).customer_id || (j.customer as any)?.id;
        if (!cid) continue;
        const st = (j as any).status || j.status;
        const c = j.customer as any;
        const isPrior = st === 'COMPLETED' || Boolean(c?.last_service_date ?? c?.lastServiceDate);
        if (isPrior) priorCustomerIds.add(cid);
      }
      const activeWorkCustomerIds = new Set<string>();
      for (const j of allJobs) {
        const st = normalizeJobStatus((j as any).status ?? j.status);
        if (st === 'COMPLETED' || st === 'DENIED') continue;
        const cid = (j as any).customer_id || (j.customer as any)?.id;
        if (cid) activeWorkCustomerIds.add(cid);
      }

      if (activeWorkCustomerIds.size > 0) {
        setTimeout(() => {
          hydrateCustomerPriorServiceFlags(Array.from(activeWorkCustomerIds)).catch(() => {});
        }, 50);
      }

      if (priorCustomerIds.size > 0) {
        // Defer slightly so the main list paints first.
        setTimeout(() => {
          loadCustomerLastServiceBrands(Array.from(priorCustomerIds)).catch(() => {});
        }, 100);
      }
      
      // AMC dots on active cards only — skip bulk completed customer_ids (global map covers returning)
      if (allJobs.length > 0) {
        setTimeout(async () => {
          try {
            const customerIds = [
              ...new Set(
                allJobs
                  .filter((job) => {
                    const st = normalizeJobStatus((job as any).status ?? job.status);
                    return st !== 'COMPLETED' && st !== 'DENIED';
                  })
                  .map((job: any) => job.customer_id || job.customer?.id)
                  .filter(Boolean)
              ),
            ];
            if (customerIds.length > 0) {
              // AMC query - Supabase already has 30s timeout, no need for additional Promise.race
              // This prevents false timeout errors on fast networks
              const { data: amcContracts } = await supabase
                .from('amc_contracts')
                .select('customer_id, status')
                .in('customer_id', customerIds)
                .eq('status', 'ACTIVE');
              
              const amcStatusMap: Record<string, boolean> = {};
              if (amcContracts) {
                amcContracts.forEach((amc: any) => {
                  amcStatusMap[amc.customer_id] = true;
                });
              }
              setCustomerAMCStatus(amcStatusMap);
            }
          } catch (amcError) {
            // Silently fail AMC loading - it's not critical for displaying jobs
            console.warn('Failed to load AMC status (non-critical):', amcError);
          }
        }, 100); // Defer by 100ms to let jobs render first
      }
      
      if (!activeOnly) {
        dashboardHistoryLoadedRef.current = true;
      }

      // Update last job IDs for next comparison (new-assignment toast removed; list uses NEW tag)
      lastJobIdsRef.current = new Set(allJobs.map(j => j.id));
    } catch (error) {
      console.error('Error loading assigned jobs:', error);
      // Don't show toast messages for timeout/network issues - these are transient and will retry automatically
      // Only log to console for debugging
    } finally {
      setJobsLoading(false);
    }
  }, [user?.technicianId, enrichCompletedJobsInList]);

  // Full dashboard slices when opening Completed / Denied / Follow-up (first time only).
  useEffect(() => {
    if (!user?.technicianId || !hasJobsRef.current) return;
    const needsHistory =
      statusFilter === 'COMPLETED' ||
      statusFilter === 'CANCELLED' ||
      statusFilter === 'RESCHEDULED';
    if (!needsHistory) return;
    if (dashboardHistoryLoadedRef.current) return;
    void loadAssignedJobs(0, { activeOnly: false });
  }, [statusFilter, user?.technicianId, loadAssignedJobs]);

  /**
   * Fetch the technician's own completed jobs for a given month so they can
   * see the total billing they generated. Only counts jobs assigned to them
   * (matches admin-side billing total in TechnicianPayments).
   */
  const loadBillingForMonth = useCallback(async (monthDate: Date) => {
    const technicianId = user?.technicianId;
    if (!technicianId) {
      setBillingJobs([]);
      return;
    }
    setBillingLoading(true);
    try {
      const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
      const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1);
      const { data, error } = await supabase
        .from('jobs')
        .select('id,actual_cost,payment_amount')
        .eq('assigned_technician_id', technicianId)
        .eq('status', 'COMPLETED')
        .gte('completed_at', monthStart.toISOString())
        .lt('completed_at', monthEnd.toISOString())
        .limit(500);

      if (error) {
        console.error('Error loading billing for month:', error);
        setBillingJobs([]);
      } else {
        setBillingJobs(data || []);
      }
    } catch (e) {
      console.error('Error loading billing for month:', e);
      setBillingJobs([]);
    } finally {
      setBillingLoading(false);
    }
  }, [user?.technicianId]);

  useEffect(() => {
    if (!billingDialogOpen) return;
    void loadBillingForMonth(billingMonth);
  }, [billingDialogOpen, billingMonth, loadBillingForMonth]);

  const billingTotalAmount = useMemo(() => {
    return billingJobs.reduce((sum: number, j: any) => {
      const raw = j.actual_cost ?? j.payment_amount ?? 0;
      const num = typeof raw === 'number' ? raw : parseFloat(raw);
      return sum + (Number.isFinite(num) ? num : 0);
    }, 0);
  }, [billingJobs]);

  const billingMonthLabel = useMemo(
    () =>
      billingMonth.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
    [billingMonth]
  );

  const isBillingCurrentMonth = useMemo(() => {
    const now = new Date();
    return (
      billingMonth.getFullYear() === now.getFullYear() &&
      billingMonth.getMonth() === now.getMonth()
    );
  }, [billingMonth]);

  useEffect(() => {
    if (statusFilter !== 'COMPLETED') {
      completedPhotosEnrichedRef.current = false;
      return;
    }
    if (completedPhotosEnrichedRef.current || jobsRef.current.length === 0) return;
    completedPhotosEnrichedRef.current = true;
    void enrichCompletedJobsInList(jobsRef.current).then((enriched) => {
      setJobs(enriched);
      jobsRef.current = enriched;
    });
  }, [statusFilter, enrichCompletedJobsInList]);

  const jobListSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleJobListSync = useCallback(() => {
    if (jobListSyncTimerRef.current) clearTimeout(jobListSyncTimerRef.current);
    jobListSyncTimerRef.current = setTimeout(() => {
      jobListSyncTimerRef.current = null;
      void loadAssignedJobs();
    }, TECH_JOB_SYNC_DEBOUNCE_MS);
  }, [loadAssignedJobs]);

  useEffect(() => {
    if (!authInitializing) {
      setAuthGraceExpired(false);
      return;
    }
    const t = setTimeout(() => setAuthGraceExpired(true), isPWAMode() ? 22_000 : 8_000);
    return () => clearTimeout(t);
  }, [authInitializing]);

  // Dashboard shell is painted (past auth gate) — APK boot overlay can dismiss.
  useEffect(() => {
    if (authInitializing && !authGraceExpired) return;
    if (user?.role === 'technician') markNativeBootReady();
  }, [authInitializing, authGraceExpired, user?.role]);

  // Redirect if not technician (after auth finishes or grace timeout)
  useEffect(() => {
    if (authInitializing && !authGraceExpired) return;
    if (user?.role === 'technician') return;
    navigate('/technician/login', { replace: true });
  }, [navigate, user, authInitializing, authGraceExpired]);

  // Load assigned jobs and assignment requests
  useEffect(() => {
    if (user?.technicianId) {
      loadAssignedJobs();
      loadAssignmentRequests();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.technicianId, loadAssignedJobs]);

  // Android app: enable location sharing + FCM push registration on start/resume.
  // Always on — no toggle; the phone only sends its location when the office
  // requests it, and job pushes need the registered token anyway.
  // Re-run on resume so a stuck is_tracking=false recovers after permission is fixed.
  useEffect(() => {
    if (!user?.technicianId) return;
    const technicianId = user.technicianId;

    const enableSharing = () => {
      void import('@/lib/technicianLiveLocation').then(({ startLiveTracking }) =>
        startLiveTracking(technicianId)
      );
      // Also register FCM directly on open/resume so Message technician works
      // even if location bootstrap is slow or fails.
      void import('@/lib/technicianPush').then(({ registerTechnicianPushToken }) =>
        registerTechnicianPushToken(technicianId)
      );
      // JWT + CallLog backup for call alerts when native ring capture missed the number.
      window.setTimeout(() => {
        void import('@/lib/technicianIncomingCall').then(({ reportRecentTechnicianCallToAdmins }) =>
          reportRecentTechnicianCallToAdmins()
        );
      }, 1200);
    };

    enableSharing();

    const onVisibility = () => {
      if (!document.hidden) enableSharing();
    };
    document.addEventListener('visibilitychange', onVisibility);

    let removeAppListener: (() => void) | undefined;
    void import('@capacitor/app')
      .then(({ App }) =>
        App.addListener('appStateChange', ({ isActive }) => {
          if (isActive) enableSharing();
        })
      )
      .then((handle) => {
        removeAppListener = () => {
          void handle.remove();
        };
      })
      .catch(() => {
        /* web / plugin missing */
      });

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      removeAppListener?.();
    };
  }, [user?.technicianId]);

  // Incoming call → silent background customer lookup + admin notify if found.
  // Technician never sees Search open for this.
  useEffect(() => {
    if (!user?.technicianId) return;
    let cleanup: (() => void) | null = null;
    let cancelled = false;
    void import('@/lib/technicianIncomingCallAutoSearch').then(
      ({ initTechnicianIncomingCallBackgroundLookup }) => {
        const dispose = initTechnicianIncomingCallBackgroundLookup();
        if (cancelled) dispose();
        else cleanup = dispose;
      }
    );
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [user?.technicianId]);

  // Tools → Arrange order: only show #1/#2 when admin turns the switch on for this tech.
  useEffect(() => {
    const techId = user?.technicianId;
    if (!techId) {
      setVisitOrderVisible(false);
      return;
    }
    let cancelled = false;
    const refresh = () => {
      void getVisitOrderVisibleForTechnician(techId).then((v) => {
        if (!cancelled) setVisitOrderVisible(v);
      });
    };
    refresh();
    const onVisibility = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [user?.technicianId]);

  // Returning customers (≥1 completed job) — same logic as admin blue indicator
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const map = await fetchCustomerIdsWithCompletedJobsMap();
        if (!cancelled) {
          setCustomerPriorServiceStatus((prev) => ({ ...map, ...prev }));
        }
      } catch (e) {
        console.warn('TechnicianDashboard: prior-service map failed', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Prefetch "last served brand" for every customer that is considered returning
  // (including returning customers served by OTHER technicians).
  useEffect(() => {
    const idsToPrefetch = new Set<string>();

    for (const j of jobs) {
      const cid = (j as any)?.customer_id || (j.customer as any)?.id;
      if (!cid) continue;
      if (customerPriorServiceStatus[cid]) idsToPrefetch.add(cid);
    }

    for (const req of assignmentRequests) {
      const job = req.job as any;
      const cid =
        job?.customer_id ||
        job?.customer?.id ||
        job?.customer?.customer_id;
      if (!cid) continue;
      if (customerPriorServiceStatus[cid]) idsToPrefetch.add(cid);
    }

    if (idsToPrefetch.size === 0) return;

    loadCustomerLastServiceBrands(Array.from(idsToPrefetch)).catch(() => {});
  }, [assignmentRequests, customerPriorServiceStatus, jobs, loadCustomerLastServiceBrands]);

  useEffect(() => {
    const ids = new Set<string>();
    for (const req of assignmentRequests) {
      const job = req.job as any;
      const cid = job?.customer_id || job?.customer?.id;
      if (cid) ids.add(cid);
    }
    if (ids.size === 0) return;
    hydrateCustomerPriorServiceFlags(Array.from(ids)).catch(() => {});
  }, [assignmentRequests, hydrateCustomerPriorServiceFlags]);

  // Always show AMC question first when entering step 3
  useEffect(() => {
    if (completeJobStep === 3) {
      setHasAMC(null);
    }
  }, [completeJobStep]);

  // Scroll to top when step changes (fixes iOS scrolling issue)
  useEffect(() => {
    if (completeDialogOpen && completeJobScrollRef.current) {
      // Small delay to ensure DOM is updated
      setTimeout(() => {
        if (completeJobScrollRef.current) {
          completeJobScrollRef.current.scrollTop = 0;
        }
      }, 100);
    }
  }, [completeJobStep, completeDialogOpen]);

  // Load QR codes: hydrate from localStorage first (offline + fast paint), network only when needed.
  const loadQrCodes = useCallback(
    async (options?: { force?: boolean }) => {
      const force = options?.force === true;
      if (!user) {
        return;
      }

      if (user.role !== 'technician') {
        return;
      }

      const technicianId = user.technicianId || user.id;

      const applyQrSnapshot = (snap: TechnicianQrSnapshotV1) => {
        setAllCommonQrCodes(snap.allCommonQrCodes);
        setCommonQrCodes(snap.commonQrCodes);
        setAllTechnicians(snap.allTechnicians);
        setTechnicians(snap.technicians);
        setCommonQrCodesForTechnician(snap.commonQrCodesForTechnician);
        setTechnicianVisibleQrCodes(snap.technicianVisibleQrCodes);
        setAllTechniciansForReports(snap.allTechniciansForReports);
        setCommonQrImageDataById(getTechnicianCommonQrImageCache(technicianId));
      };

      const cached = getTechnicianQrSnapshot(technicianId);
      if (cached) {
        applyQrSnapshot(cached);
      }

      const online = typeof navigator !== 'undefined' && navigator.onLine;
      if (!online) {
        return;
      }

      if (!force && cached && Date.now() - cached.savedAt < QR_NETWORK_MIN_INTERVAL_MS) {
        return;
      }

      try {
        // Always fetch this technician by id: getAll(100) only returns the newest 100 rows, so older techs
        // were missing from the roster and got no common_qr_code_ids / visible_qr_codes (looked "unassigned").
        const [commonResult, allTechniciansResult, technicianCommonQrResult, meResult] = await Promise.all([
          db.commonQrCodes.getAll(),
          db.technicians.getRosterForTechnicianApp(),
          db.technicianCommonQr.getAll(),
          db.technicians.getById(technicianId),
        ]);

        let allCommonQrCodesData: CommonQrCode[] = [];
        if (commonResult.data) {
          allCommonQrCodesData = commonResult.data
            .map((qr: any) => mapCommonQrRow(qr))
            .filter(Boolean) as CommonQrCode[];
          setAllCommonQrCodes(allCommonQrCodesData);
          cacheQrCodes(allCommonQrCodesData);
        }

        let allTechniciansData: TechnicianQrPickerRow[] = [];
        let allTechniciansForReportsData: TechnicianQrSnapshotV1['allTechniciansForReports'] = [];
        let currentTechnicianVisibleQrCodes: string[] = ['all'];
        let rawVisibleQrCodes: any = null;
        let assignedCommonQrs: CommonQrCode[] = [];
        let technicianCommonQrCatalog: CommonQrCode[] = [];
        let assignedCommonIdsForRef: string[] = [];

        const roster = allTechniciansResult.data || [];
        const me = meResult.data;

        if (roster.length > 0) {
          allTechniciansForReportsData = roster.map((tech: any) => ({
            id: tech.id,
            fullName: tech.full_name,
            full_name: tech.full_name,
          }));
          setAllTechniciansForReports(allTechniciansForReportsData);

          allTechniciansData = roster
            .filter((tech: any) => tech.qr_code && tech.qr_code.trim() !== '')
            .map((tech: any) => ({
              id: tech.id,
              fullName: tech.full_name,
              qrCode: tech.qr_code,
              visibleQrCodes: tech.visible_qr_codes || [],
              upiId: String(tech.upi_id || '').trim().toLowerCase(),
              payeeName: String(tech.payee_name || '').trim(),
              upiPhone: String(tech.upi_phone || '')
                .replace(/\D/g, '')
                .slice(-10),
              dynamicUpiEnabled: Boolean(tech.dynamic_upi_enabled),
            }));

          setAllTechnicians(allTechniciansData);
        } else {
          setAllTechniciansForReports([]);
          setAllTechnicians([]);
        }

        const currentTech = me ?? roster.find((tech: any) => tech.id === technicianId);
        if (currentTech) {
          rawVisibleQrCodes = currentTech.visible_qr_codes;
          currentTechnicianVisibleQrCodes =
            rawVisibleQrCodes === null || rawVisibleQrCodes === undefined ? ['all'] : rawVisibleQrCodes;
          setTechnicianVisibleQrCodes(currentTechnicianVisibleQrCodes);

          const commonQrIds = normalizeTechnicianAssignedCommonQrIds({
            common_qr_code_ids: currentTech.common_qr_code_ids,
            common_qr_code_id: (currentTech as any).common_qr_code_id,
          });
          assignedCommonIdsForRef = commonQrIds.map((x) => String(x));
          const idSet = new Set(assignedCommonIdsForRef);
          technicianCommonQrCatalog = (technicianCommonQrResult.data || []).map((q: any) => ({
            id: q.id,
            name: q.name,
            qrCodeUrl: q.qr_code_url,
            createdAt: q.created_at,
            updatedAt: q.updated_at,
          }));
          assignedCommonQrs = technicianCommonQrCatalog.filter((q: CommonQrCode) => idSet.has(String(q.id)));
          setCommonQrCodesForTechnician(assignedCommonQrs);

          const paymentQr =
            (currentTech as any).qr_code && String((currentTech as any).qr_code).trim()
              ? String((currentTech as any).qr_code).trim()
              : allTechniciansData.find((t) => t.id === technicianId)?.qrCode;
          if (paymentQr) {
            cacheTechnicianQrCode(technicianId, paymentQr);
          }
        } else {
          setTechnicianVisibleQrCodes(['all']);
          setCommonQrCodesForTechnician([]);
        }

        let snapshotCommon: CommonQrCode[] = [];
        let snapshotTechs: TechnicianQrPickerRow[] = [];

        if (
          currentTechnicianVisibleQrCodes.length === 0 &&
          rawVisibleQrCodes !== null &&
          rawVisibleQrCodes !== undefined
        ) {
          setCommonQrCodes([]);
          setTechnicians([]);
          snapshotCommon = [];
          snapshotTechs = [];
        } else if (currentTechnicianVisibleQrCodes.includes('all')) {
          setCommonQrCodes(allCommonQrCodesData);
          setTechnicians(allTechniciansData);
          snapshotCommon = allCommonQrCodesData;
          snapshotTechs = allTechniciansData;
        } else {
          const visibleQrCodesStr = currentTechnicianVisibleQrCodes.map((id) => String(id));

          const filteredCommon = allCommonQrCodesData.filter((qr) => {
            const formattedId = `common_${String(qr.id)}`;
            return visibleQrCodesStr.includes(formattedId);
          });

          const filteredTechnicians = allTechniciansData.filter((tech) => {
            const formattedId = `technician_${String(tech.id)}`;
            return visibleQrCodesStr.includes(formattedId);
          });

          setCommonQrCodes(filteredCommon);
          setTechnicians(filteredTechnicians);
          snapshotCommon = filteredCommon;
          snapshotTechs = filteredTechnicians;
        }

        qrLiveRef.current = {
          technicianId,
          allCommon: allCommonQrCodesData,
          technicianCommonFull: technicianCommonQrCatalog,
          allTechPicker: allTechniciansData,
          visibleForPicker: currentTechnicianVisibleQrCodes,
          rawVisibleQrCodes,
          assignedCommonIds: assignedCommonIdsForRef,
          allTechForReports: allTechniciansForReportsData,
          hydrated: true,
        };

        saveTechnicianQrSnapshot(technicianId, {
          savedAt: Date.now(),
          allCommonQrCodes: allCommonQrCodesData,
          commonQrCodes: snapshotCommon,
          allTechnicians: allTechniciansData,
          technicians: snapshotTechs,
          commonQrCodesForTechnician: assignedCommonQrs,
          technicianVisibleQrCodes: currentTechnicianVisibleQrCodes,
          allTechniciansForReports: allTechniciansForReportsData,
        });

        setQrAssetsVersion((v) => v + 1);

        void prefetchTechnicianCommonQrImages(
          technicianId,
          assignedCommonQrs.map((q) => ({ id: q.id, qrCodeUrl: q.qrCodeUrl }))
        ).then((map) => setCommonQrImageDataById(map));
      } catch (error) {
        console.error('Error loading QR codes:', error);
      }
    },
    [user]
  );

  /** Apply derived QR UI from qrLiveRef (used after Realtime merge — no extra DB round-trip). */
  const recomputeQrUiFromLiveRef = useCallback(() => {
    const {
      technicianId,
      allCommon,
      technicianCommonFull,
      allTechPicker,
      visibleForPicker,
      rawVisibleQrCodes,
      assignedCommonIds,
      allTechForReports,
    } = qrLiveRef.current;

    if (!technicianId) return;

    const idSet = new Set(assignedCommonIds.map(String));
    const assignedCommonQrs = technicianCommonFull.filter((q) => idSet.has(String(q.id)));
    setCommonQrCodesForTechnician(assignedCommonQrs);
    setTechnicianVisibleQrCodes(visibleForPicker);

    let snapshotCommon: CommonQrCode[] = [];
    let snapshotTechs: TechnicianQrPickerRow[] = [];

    if (
      visibleForPicker.length === 0 &&
      rawVisibleQrCodes !== null &&
      rawVisibleQrCodes !== undefined
    ) {
      setCommonQrCodes([]);
      setTechnicians([]);
      snapshotCommon = [];
      snapshotTechs = [];
    } else if (visibleForPicker.includes('all')) {
      setCommonQrCodes(allCommon);
      setTechnicians(allTechPicker);
      snapshotCommon = allCommon;
      snapshotTechs = allTechPicker;
    } else {
      const visibleQrCodesStr = visibleForPicker.map((id) => String(id));
      const filteredCommon = allCommon.filter((qr) => {
        const formattedId = `common_${String(qr.id)}`;
        return visibleQrCodesStr.includes(formattedId);
      });
      const filteredTechnicians = allTechPicker.filter((tech) => {
        const formattedId = `technician_${String(tech.id)}`;
        return visibleQrCodesStr.includes(formattedId);
      });
      setCommonQrCodes(filteredCommon);
      setTechnicians(filteredTechnicians);
      snapshotCommon = filteredCommon;
      snapshotTechs = filteredTechnicians;
    }

    const paymentQr = allTechPicker.find((t) => t.id === technicianId)?.qrCode;
    if (paymentQr && String(paymentQr).trim()) {
      cacheTechnicianQrCode(technicianId, String(paymentQr).trim());
    }

    setAllCommonQrCodes(allCommon);
    setAllTechnicians(allTechPicker);
    setAllTechniciansForReports(allTechForReports);

    saveTechnicianQrSnapshot(technicianId, {
      savedAt: Date.now(),
      allCommonQrCodes: allCommon,
      commonQrCodes: snapshotCommon,
      allTechnicians: allTechPicker,
      technicians: snapshotTechs,
      commonQrCodesForTechnician: assignedCommonQrs,
      technicianVisibleQrCodes: visibleForPicker,
      allTechniciansForReports: allTechForReports,
    });

    setQrAssetsVersion((v) => v + 1);

    void prefetchTechnicianCommonQrImages(
      technicianId,
      assignedCommonQrs.map((q) => ({ id: q.id, qrCodeUrl: q.qrCodeUrl }))
    ).then((map) => setCommonQrImageDataById(map));
  }, []);

  /** Merge Realtime row into ref and refresh UI immediately (low egress vs loadQrCodes). */
  const handleQrPostgresChange = useCallback(
    (payload: {
      table?: string;
      eventType?: string;
      new?: Record<string, any>;
      old?: Record<string, any>;
    }) => {
      if (!user || user.role !== 'technician') return;
      const technicianId = user.technicianId || user.id;
      if (!technicianId || !payload?.table) return;

      if (!qrLiveRef.current.hydrated || qrLiveRef.current.technicianId !== technicianId) {
        loadQrCodes({ force: true });
        return;
      }

      try {
        if (payload.table === 'common_qr_codes') {
          if (payload.eventType === 'DELETE' && payload.old?.id) {
            qrLiveRef.current.allCommon = qrLiveRef.current.allCommon.filter((q) => q.id !== payload.old!.id);
          } else if (payload.new?.id) {
            const row = payload.new;
            const item = mapCommonQrRow(row as Record<string, unknown>);
            if (!item) {
              loadQrCodes({ force: true });
              return;
            }
            const prev = qrLiveRef.current.allCommon;
            const i = prev.findIndex((q) => q.id === item.id);
            qrLiveRef.current.allCommon =
              i === -1 ? [...prev, item] : prev.map((q, idx) => (idx === i ? item : q));
            cacheQrCodes(qrLiveRef.current.allCommon);
          } else {
            loadQrCodes({ force: true });
            return;
          }
          recomputeQrUiFromLiveRef();
          return;
        }

        if (payload.table === 'technician_common_qr') {
          if (payload.eventType === 'DELETE' && payload.old?.id) {
            qrLiveRef.current.technicianCommonFull = qrLiveRef.current.technicianCommonFull.filter(
              (q) => q.id !== payload.old!.id
            );
          } else if (payload.new?.id) {
            const row = payload.new;
            const item: CommonQrCode = {
              id: row.id,
              name: row.name ?? '',
              qrCodeUrl: row.qr_code_url ?? '',
              createdAt: row.created_at ?? '',
              updatedAt: row.updated_at ?? '',
            };
            const prev = qrLiveRef.current.technicianCommonFull;
            const i = prev.findIndex((q) => q.id === item.id);
            qrLiveRef.current.technicianCommonFull =
              i === -1 ? [...prev, item] : prev.map((q, idx) => (idx === i ? item : q));
          } else {
            loadQrCodes({ force: true });
            return;
          }
          recomputeQrUiFromLiveRef();
          return;
        }

        if (payload.table === 'technicians' && payload.new?.id === technicianId) {
          const row = payload.new;
          const rawVis = row.visible_qr_codes;
          qrLiveRef.current.rawVisibleQrCodes = rawVis;
          qrLiveRef.current.visibleForPicker =
            rawVis === null || rawVis === undefined ? ['all'] : rawVis;
          qrLiveRef.current.assignedCommonIds = normalizeTechnicianAssignedCommonQrIds({
            common_qr_code_ids: row.common_qr_code_ids,
            common_qr_code_id: row.common_qr_code_id,
          }).map(String);

          const qr = String(row.qr_code || '').trim();
          const prevPicker = qrLiveRef.current.allTechPicker;
          const prevName =
            row.full_name ||
            prevPicker.find((t) => t.id === technicianId)?.fullName ||
            '';
          let nextPicker = prevPicker.filter((t) => t.id !== technicianId);
          if (qr) {
            nextPicker = [
              ...nextPicker,
              {
                id: technicianId,
                fullName: prevName,
                qrCode: qr,
                visibleQrCodes: row.visible_qr_codes || [],
                upiId: String(row.upi_id || '').trim().toLowerCase(),
                payeeName: String(row.payee_name || '').trim(),
                upiPhone: String(row.upi_phone || '')
                  .replace(/\D/g, '')
                  .slice(-10),
                dynamicUpiEnabled: Boolean(row.dynamic_upi_enabled),
              },
            ];
          }
          qrLiveRef.current.allTechPicker = nextPicker;
          if (qr) cacheTechnicianQrCode(technicianId, qr);

          qrLiveRef.current.allTechForReports = qrLiveRef.current.allTechForReports.map((t) =>
            t.id === technicianId ? { ...t, fullName: prevName, full_name: prevName } : t
          );

          recomputeQrUiFromLiveRef();
          return;
        }
      } catch (e) {
        console.warn('[TechnicianDashboard] QR realtime merge failed, full refetch', e);
        loadQrCodes({ force: true });
      }
    },
    [user, loadQrCodes, recomputeQrUiFromLiveRef]
  );

  /** Payment step: pull latest admin QR visibility/assignments once when entering step 4 or when bill becomes non-zero there (Realtime still updates in between). */
  useEffect(() => {
    if (!user || user.role !== 'technician') return;
    if (!completeDialogOpen) {
      qrPaymentStepPrevStepRef.current = null;
      qrPaymentStepHadBillRef.current = false;
      return;
    }
    if (completeJobStep !== 4) {
      qrPaymentStepPrevStepRef.current = completeJobStep;
      qrPaymentStepHadBillRef.current = false;
      return;
    }

    const n = parseMoneyAmount(billAmount);
    const billOk = billAmount !== '' && Number.isFinite(n) && n !== 0;
    const enteredStep4 = qrPaymentStepPrevStepRef.current !== 4;
    qrPaymentStepPrevStepRef.current = 4;

    if (!billOk) {
      qrPaymentStepHadBillRef.current = false;
      return;
    }

    const billBecameOk = !qrPaymentStepHadBillRef.current;
    qrPaymentStepHadBillRef.current = true;

    if (!enteredStep4 && !billBecameOk) return;

    loadQrCodes({ force: true });
  }, [completeDialogOpen, completeJobStep, billAmount, user, loadQrCodes]);

  /** If admin changes QR list while technician is on payment step, drop selection that no longer exists. */
  useEffect(() => {
    if (!user || user.role !== 'technician') return;
    if (!completeDialogOpen || completeJobStep !== 4) return;
    if (!selectedQrCodeId || selectedQrCodeId === 'no-qr') return;

    const listsPopulated = commonQrCodes.length > 0 || technicians.length > 0;
    const catalogReady = qrLiveRef.current.hydrated;
    if (!listsPopulated && !catalogReady) return;

    if (listsPopulated || catalogReady) {
      if (selectedQrCodeId.startsWith('common_')) {
        const id = selectedQrCodeId.replace('common_', '');
        if (!commonQrCodes.some((q) => String(q.id) === id)) {
          setSelectedQrCodeId('');
          setQrCodeType('');
        }
      } else if (selectedQrCodeId.startsWith('technician_')) {
        const id = selectedQrCodeId.replace('technician_', '');
        if (!technicians.some((t) => String(t.id) === id)) {
          setSelectedQrCodeId('');
          setQrCodeType('');
        }
      }
    }
  }, [
    completeDialogOpen,
    completeJobStep,
    selectedQrCodeId,
    commonQrCodes,
    technicians,
    qrAssetsVersion,
    user,
  ]);

  // Load QR codes on mount and when user changes
  useEffect(() => {
    console.log('🔍 QR Code useEffect triggered', { 
      hasUser: !!user, 
      userRole: user?.role,
      userId: user?.id,
      technicianId: user?.technicianId,
      loading: authInitializing
    });

    if (authInitializing) {
      return;
    }

    // Always try to load if user exists and auth is done loading (will check role inside)
    if (user) {
      console.log('🚀 Calling loadQrCodes, user:', { id: user.id, role: user.role });
      loadQrCodes();
    } else {
      console.log('⚠️ No user, not loading QR codes');
    }
  }, [user, authInitializing, loadQrCodes]);

  useEffect(() => {
    if (!user) {
      qrLiveRef.current = emptyTechnicianQrLiveRef();
    }
  }, [user]);

  // Realtime for QR codes — merge payload into local ref (immediate UI, no 4-query refetch; full fetch only if merge fails)
  useEffect(() => {
    if (!user || user.role !== 'technician') return;
    const technicianId = user.technicianId || user.id;

    const channel = supabase
      .channel(`technician-qr-codes-${technicianId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'common_qr_codes' },
        (payload) => handleQrPostgresChange(payload as any)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'technician_common_qr' },
        (payload) => handleQrPostgresChange(payload as any)
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'technicians',
          filter: `id=eq.${technicianId}`,
        },
        (payload) => handleQrPostgresChange(payload as any)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, user?.technicianId, user?.role, handleQrPostgresChange]);

  // Reconnect after offline: one full sync (infrequent; normal path is Realtime merge).
  useEffect(() => {
    if (!user || user.role !== 'technician') return;
    const onOnline = () => loadQrCodes({ force: true });
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [user?.role, loadQrCodes]);

  // Setup offline photo upload retry mechanism
  useEffect(() => {
    if (!user || user.role !== 'technician') {
      return;
    }

      // Process any queued photos on mount
      const queuedCount = getQueuedPhotosCount();
      if (queuedCount > 0) {
        console.log(`📸 Found ${queuedCount} saved photo(s) - uploading now...`);
        // Process immediately - no toast needed
        setTimeout(() => {
          processQueuedPhotos();
        }, 500);
      }

    // Start automatic retry processing for photos (every 30 seconds)
    startRetryProcessing(30000);

    // Setup listener for when network comes back online
    const cleanupPhotos = setupOnlineListener();

    return () => {
      stopRetryProcessing();
      cleanupPhotos();
    };
  }, [user]);

  /** Merge API report rows with completed jobs already on this device (same customer). */
  const mergeCustomerReportJobsForUuid = useCallback(
    (fromApi: any[], customerUuid: string) => {
      const byId = new Map<string, any>();
      for (const row of fromApi || []) {
        if (row?.id) byId.set(row.id, row);
      }
      for (const j of jobsRef.current) {
        const cid = (j as any).customer_id || (j.customer as any)?.id;
        if (cid !== customerUuid) continue;
        const st = String((j as any).status || j.status || '').toUpperCase();
        if (st !== 'COMPLETED') continue;
        if (!byId.has(j.id)) byId.set(j.id, j);
      }
      return Array.from(byId.values());
    },
    []
  );

  // Fetch customer jobs when report dialog opens
  useEffect(() => {
    const fetchCustomerReportJobs = async () => {
      if (!customerReportDialogOpen || !selectedCustomerForReport) {
        // Photo viewer temporarily hides the report — keep cached jobs for instant resume.
        if (suspendedDialogRef.current?.type === 'report') return;
        setCustomerReportJobs([]);
        return;
      }

      if (skipNextReportFetchRef.current) {
        skipNextReportFetchRef.current = false;
        return;
      }

      setLoadingCustomerReportJobs(true);
      try {
        const customerUuid = await resolveCustomerUuidForQueries(selectedCustomerForReport);

        if (customerUuid) {
          const { data, error } = await db.jobs.getByCustomerIdForReportEnrichedAsTechnician(customerUuid);
          if (error) {
            console.error('Error fetching customer jobs for report:', error);
            setCustomerReportJobs(mergeCustomerReportJobsForUuid([], customerUuid));
          } else {
            const merged = mergeCustomerReportJobsForUuid(data || [], customerUuid);
            try {
              const enriched = await enrichJobsWithAfterPhotosIfNeeded(merged);
              setCustomerReportJobs(enriched);
            } catch {
              setCustomerReportJobs(merged);
            }
          }
        } else {
          setCustomerReportJobs([]);
        }
      } catch (error) {
        console.error('Error fetching customer jobs for report:', error);
        setCustomerReportJobs([]);
      } finally {
        setLoadingCustomerReportJobs(false);
      }
    };

    fetchCustomerReportJobs();
  }, [customerReportDialogOpen, selectedCustomerForReport, mergeCustomerReportJobsForUuid]);

  // Show notification if there are queued photos or job completions (less frequent)
  useEffect(() => {
    if (!user || user.role !== 'technician') {
      return;
    }

    const checkQueuedItems = () => {
      const queuedPhotosCount = getQueuedPhotosCount();
      
      if (queuedPhotosCount > 0) {
        // Show notification only once every 2 minutes to avoid spam
        const lastNotification = localStorage.getItem('last_queued_items_notification');
        const now = Date.now();
        if (!lastNotification || now - parseInt(lastNotification) > 120000) { // Show once per 2 minutes
          const messages = [];
          if (queuedPhotosCount > 0) {
            messages.push(`${queuedPhotosCount} photo(s)`);
          }
          
          // Data saved safely, will submit automatically (no toast needed)
          localStorage.setItem('last_queued_items_notification', now.toString());
        }
      }
    };

    // Check after a delay (don't show immediately on load)
    const initialDelay = setTimeout(() => {
      checkQueuedItems();
    }, 5000);

    // Check periodically
    const interval = setInterval(checkQueuedItems, 120000); // Check every 2 minutes

    return () => {
      clearTimeout(initialDelay);
      clearInterval(interval);
    };
  }, [user]);

  // Realtime: admin broadcast (instant) + jobs postgres_changes + optional technician_job_sync table.
  useEffect(() => {
    if (!user?.technicianId) return;

    const technicianId = user.technicianId;
    let jobsChannel: ReturnType<typeof supabase.channel> | null = null;
    let syncChannel: ReturnType<typeof supabase.channel> | null = null;
    let broadcastChannel: ReturnType<typeof supabase.channel> | null = null;
    let jobsRetryTimeout: ReturnType<typeof setTimeout> | null = null;
    let jobsRetryCount = 0;
    const maxRetries = 3;
    const retryDelay = 2000;
    const isMounted = { current: true };
    let jobsSubscribed = false;
    let broadcastSubscribed = false;

    const markRealtimeHealth = () => {
      if (!isMounted.current) return;
      setRealtimeConnected(jobsSubscribed || broadcastSubscribed);
    };

    const jobServiceSiteFieldsChanged = (prev: Job, incoming: Record<string, unknown>): boolean => {
      const keys = ['service_address', 'service_location', 'service_site'] as const;
      return keys.some((key) => {
        if (!(key in incoming)) return false;
        const prevVal =
          (prev as Record<string, unknown>)[key] ??
          (prev as Record<string, unknown>)[key === 'service_address' ? 'serviceAddress' : key === 'service_location' ? 'serviceLocation' : 'serviceSite'];
        try {
          return JSON.stringify(prevVal ?? null) !== JSON.stringify(incoming[key] ?? null);
        } catch {
          return prevVal !== incoming[key];
        }
      });
    };

    const handleAssignedJobRowChange = async (payload: { new: Record<string, unknown> }) => {
      if (!isMounted.current) return;
      const updatedJob = payload.new as any;
      if (!updatedJob?.id) return;
      if (processingJobsRef.current.has(updatedJob.id)) return;

      const currentJobsState = jobsRef.current;
      const jobInList = currentJobsState.find((j) => j.id === updatedJob.id);
      const isInList = !!jobInList;

      processingJobsRef.current.add(updatedJob.id);
      try {
        if (isInList) {
          // Address/map edits sync job rows from admin — refetch so embedded customer matches.
          if (jobServiceSiteFieldsChanged(jobInList!, updatedJob)) {
            scheduleJobListSync();
            return;
          }
          setJobs((prev) => {
            const idx = prev.findIndex((j) => j.id === updatedJob.id);
            if (idx < 0) return prev;
            const next = [...prev];
            next[idx] = { ...(next[idx] as any), ...updatedJob } as any;
            shouldPreserveOrderRef.current = true;
            jobsRef.current = next;
            return next;
          });
          return;
        }

        scheduleJobListSync();
      } finally {
        processingJobsRef.current.delete(updatedJob.id);
      }
    };

    const setupJobsChannel = () => {
      if (!isMounted.current) return;
      if (jobsChannel) {
        try {
          supabase.removeChannel(jobsChannel);
        } catch (_) {}
        jobsChannel = null;
        jobsSubscribed = false;
        markRealtimeHealth();
      }

      const jobRowChangeOpts = {
        schema: 'public' as const,
        table: 'jobs' as const,
        filter: `assigned_technician_id=eq.${technicianId}`,
      };

      jobsChannel = supabase
        .channel(`technician-jobs-${technicianId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', ...jobRowChangeOpts },
          (payload) => {
            void handleAssignedJobRowChange(payload as { new: Record<string, unknown> });
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', ...jobRowChangeOpts },
          (payload) => {
            void handleAssignedJobRowChange(payload as { new: Record<string, unknown> });
          }
        )
        .subscribe((status, err) => {
          if (!isMounted.current) return;
          if (err) {
            jobsSubscribed = false;
            markRealtimeHealth();
            if (jobsRetryCount < maxRetries) {
              jobsRetryCount++;
              jobsRetryTimeout = setTimeout(setupJobsChannel, retryDelay);
            }
            return;
          }
          if (status === 'SUBSCRIBED') {
            jobsRetryCount = 0;
            jobsSubscribed = true;
            markRealtimeHealth();
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            jobsSubscribed = false;
            markRealtimeHealth();
            if (jobsRetryCount < maxRetries) {
              jobsRetryCount++;
              jobsRetryTimeout = setTimeout(setupJobsChannel, retryDelay);
            }
          }
        });
    };

    syncChannel = supabase
      .channel(`technician-job-sync-${technicianId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'technician_job_sync',
          filter: `technician_id=eq.${technicianId}`,
        },
        () => {
          scheduleJobListSync();
        }
      )
      .subscribe();

    broadcastChannel = supabase
      .channel(TECHNICIAN_JOB_LIST_BROADCAST_CHANNEL)
      .on(
        'broadcast',
        { event: TECHNICIAN_JOB_LIST_BROADCAST_EVENT },
        ({ payload }) => {
          const p = payload as TechnicianJobListRefreshPayload | undefined;
          if (p?.technicianIds?.includes(technicianId)) {
            scheduleJobListSync();
          }
        }
      )
      .subscribe((status) => {
        if (!isMounted.current) return;
        if (status === 'SUBSCRIBED') {
          broadcastSubscribed = true;
          markRealtimeHealth();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          broadcastSubscribed = false;
          markRealtimeHealth();
        }
      });

    setupJobsChannel();

    return () => {
      isMounted.current = false;
      if (jobsRetryTimeout) clearTimeout(jobsRetryTimeout);
      if (jobListSyncTimerRef.current) {
        clearTimeout(jobListSyncTimerRef.current);
        jobListSyncTimerRef.current = null;
      }
      for (const ch of [jobsChannel, syncChannel, broadcastChannel]) {
        if (ch) {
          try {
            supabase.removeChannel(ch);
          } catch (_) {}
        }
      }
    };
  }, [user?.technicianId, scheduleJobListSync]);

  // Request notification permission on component mount
  useEffect(() => {
    if (user?.technicianId && 'Notification' in window) {
      // Request permission when technician logs in
      requestNotificationPermission().then((permission) => {
        if (permission === 'granted') {
          console.log('✅ Notification permission granted');
        } else if (permission === 'denied') {
          console.warn('⚠️ Notification permission denied');
        } else {
          console.log('ℹ️ Notification permission default (user will be prompted)');
        }
      });
    }
  }, [user?.technicianId]);

  // Get current location and update in database
  const getCurrentLocation = useCallback(async (autoUpdate: boolean = false) => {
    console.log('📍 [TechnicianDashboard] getCurrentLocation called', { autoUpdate });
    
    // Check if location tracking is enabled - block ALL updates when disabled
    const locationTrackingEnabled = localStorage.getItem('technician_location_tracking_enabled') !== 'false';
    const settingValue = localStorage.getItem('technician_location_tracking_enabled');
    console.log('📍 [TechnicianDashboard] Location tracking setting check:', {
      settingValue,
      locationTrackingEnabled,
      willProceed: locationTrackingEnabled
    });
    
    if (!locationTrackingEnabled) {
      console.log('🚫 [TechnicianDashboard] Location tracking is DISABLED - BLOCKING all location operations');
      console.log('🚫 [TechnicianDashboard] - Geolocation API call: BLOCKED');
      console.log('🚫 [TechnicianDashboard] - Database update: BLOCKED');
      console.log('🚫 [TechnicianDashboard] - Status update to AVAILABLE: BLOCKED');
      setLocationError('Location tracking is disabled in settings. Please enable it in Settings to update your location.');
      setLocationErrorType('other');
      toast.error('🚫 Location tracking is disabled. Enable it in Settings to update your location.');
      return;
    }
    
    console.log('✅ [TechnicianDashboard] Location tracking is ENABLED - proceeding with location update');

    setLocationError(null);
    setLocationErrorType(null);
    setLocationPermissionDenied(false);

    if (!navigator.geolocation) {
      console.error('Geolocation not supported');
      const errorMsg = 'Location services not supported. Distance calculations will not be available.';
      setLocationError(errorMsg);
      setLocationErrorType('other');
      toast.error(errorMsg);
      return;
    }

    // Check if we're on HTTPS or localhost (required for geolocation)
    const isSecure = window.location.protocol === 'https:' || 
                     window.location.hostname === 'localhost' || 
                     window.location.hostname === '127.0.0.1';
    
    if (!isSecure) {
      console.error('Location access requires HTTPS');
      const errorMsg = 'Location access requires HTTPS. Please use a secure connection.';
      setLocationError(errorMsg);
      setLocationErrorType('other');
      toast.error(errorMsg);
      return;
    }

    // Check permission status for UI purposes only (don't block - Permissions API is unreliable)
    // On iOS and some browsers, Permissions API doesn't work correctly, so we always try getCurrentPosition
    let permissionStatus = 'unknown';
    try {
      if ('permissions' in navigator) {
        const result = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
        permissionStatus = result.state;
        // Listen for permission changes
        result.onchange = () => {
          if (result.state === 'granted') {
            setLocationPermissionDenied(false);
            setLocationError(null);
            setLocationErrorType(null);
          } else if (result.state === 'denied') {
            setLocationPermissionDenied(true);
            setLocationErrorType('permission');
          }
        };
      }
    } catch (e) {
      // Permissions API not supported or failed - this is common on iOS and some browsers
      console.log('Permissions API not available or unreliable - will try getCurrentPosition directly');
    }

    // Don't block based on permission check - let getCurrentPosition handle it naturally
    // The Permissions API can return incorrect states, especially on mobile browsers
    // Only use it for informational purposes, not to prevent the geolocation call

    console.log('🌐 [TechnicianDashboard] Calling navigator.geolocation.getCurrentPosition...');
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        console.log('✅ [TechnicianDashboard] Geolocation API returned position:', {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy
        });
        
        const location = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        setCurrentLocation(location);
        setCurrentLocationAccuracyM(
          Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null
        );
        console.log('📍 [TechnicianDashboard] Current location set in state:', location);

        // Update technician location and set status to AVAILABLE in database
        // Double-check location tracking is still enabled before saving to DB
        const locationTrackingEnabled = localStorage.getItem('technician_location_tracking_enabled') !== 'false';
        const settingValue = localStorage.getItem('technician_location_tracking_enabled');
        console.log('💾 [TechnicianDashboard] Before database update - checking setting again:', {
          settingValue,
          locationTrackingEnabled
        });
        
        if (!locationTrackingEnabled) {
          console.log('🚫 [TechnicianDashboard] Location tracking DISABLED - BLOCKING database update');
          console.log('🚫 [TechnicianDashboard] - current_location field: NOT SAVED');
          console.log('🚫 [TechnicianDashboard] - status field: NOT UPDATED to AVAILABLE');
          return;
        }
        
        console.log('✅ [TechnicianDashboard] Location tracking still ENABLED - proceeding with database update');

        if (user?.technicianId) {
          try {
            const sessionReady = await ensureSupabaseSessionForWrite();
            if (!sessionReady.ok) {
              console.warn(
                '⚠️ [TechnicianDashboard] Skipping location upload — no valid auth session:',
                sessionReady.reason
              );
              if (!autoUpdate) {
                const errorMsg = locationUploadErrorMessage(null, {
                  autoUpdate: false,
                  sessionExpired: true,
                });
                setLocationError(errorMsg);
                setLocationErrorType('upload');
                toast.error(errorMsg, { duration: 8000 });
              }
              return;
            }

            const locationData = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              lastUpdated: new Date().toISOString(),
              accuracy: position.coords.accuracy || null
            };

            console.log('💾 [TechnicianDashboard] Updating database with location data:', locationData);
            const { error, data } = await db.technicians.update(user.technicianId, {
              current_location: locationData,
              status: 'AVAILABLE' // Automatically set to AVAILABLE when location is updated
            });

            if (error) {
              console.error('❌ [TechnicianDashboard] Error updating technician location in database:', error);
              const errorMsg = locationUploadErrorMessage(error, { autoUpdate });
              if (!autoUpdate) {
                setLocationError(errorMsg);
                setLocationErrorType('upload');
                toast.error(errorMsg, { duration: 8000 });
              } else {
                console.warn('⚠️ [TechnicianDashboard] Background location upload failed:', errorMsg);
              }
            } else {
              console.log('✅ [TechnicianDashboard] Technician location and status updated successfully in database:', {
                location: locationData,
                updatedData: data,
                fieldsUpdated: ['current_location', 'status']
              });
              setLocationError(null);
              setLocationErrorType(null);
              // Location updated silently
            }
          } catch (error) {
            console.error('Error updating technician location:', error);
            const errorMsg = locationUploadErrorMessage(error, { autoUpdate });
            if (!autoUpdate) {
              setLocationError(errorMsg);
              setLocationErrorType('upload');
              toast.error(errorMsg, { duration: 8000 });
            } else {
              console.warn('⚠️ [TechnicianDashboard] Background location upload failed:', errorMsg);
            }
          }
        }
      },
      (error) => {
        console.error('Error getting location:', error);
        let errorMsg = 'Unable to get your location. Distance calculations will not be available.';
        let errorTypeValue: 'permission' | 'upload' | 'location' | 'other' = 'location';
        
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMsg = 'Location permission denied. Click "Request Permission Again" to try again.';
            errorTypeValue = 'permission';
            setLocationPermissionDenied(true);
            break;
          case error.POSITION_UNAVAILABLE:
            errorMsg = 'Location information unavailable. Make sure GPS is enabled and try again.';
            errorTypeValue = 'location';
            break;
          case error.TIMEOUT:
            errorMsg = 'Location request timed out. Please try again.';
            errorTypeValue = 'location';
            break;
          default:
            errorMsg = `An unknown error occurred (code: ${error.code}). Please try again.`;
            errorTypeValue = 'other';
            break;
        }
        
        setLocationError(errorMsg);
        setLocationErrorType(errorTypeValue);
        toast.error(errorMsg, { duration: 8000 });
      },
      {
        enableHighAccuracy: false, // Set to false for faster response (less accurate but more reliable)
        timeout: 60000, // Increased to 60 seconds for mobile/PWA - GPS can take longer on mobile devices
        maximumAge: 300000 // 5 minutes - use cached location if available (helps with timeout issues)
      }
    );
  }, [user?.technicianId]);

  // Calculate distance between two points using Haversine formula
  const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // Distance in kilometers
  };

  // Calculate distances for all jobs
  const calculateDistances = () => {
    if (!currentLocation) return;

    const newDistances: {[jobId: string]: number} = {};

    // Calculate distances for assigned jobs
    jobs.forEach(job => {
      const locDisplay = getJobLocationDisplay(job, job.customer);
      const customerLocation = locDisplay.location as any;
      if (customerLocation?.latitude && customerLocation?.longitude) {
        const distance = calculateDistance(
          currentLocation.lat,
          currentLocation.lng,
          customerLocation.latitude,
          customerLocation.longitude
        );
        newDistances[job.id] = Math.round(distance * 10) / 10; // Round to 1 decimal place
      }
    });

    // Calculate distances for assignment requests
    assignmentRequests.forEach(request => {
      const job = request.job as any;
      const locDisplay = getJobLocationDisplay(job, job?.customer);
      const customerLocation = locDisplay.location as any;
      if (customerLocation?.latitude && customerLocation?.longitude) {
        const distance = calculateDistance(
          currentLocation.lat,
          currentLocation.lng,
          customerLocation.latitude,
          customerLocation.longitude
        );
        newDistances[job.id] = Math.round(distance * 10) / 10;
      }
    });

    setDistances(newDistances);
  };

  // Recalculate distances when location or jobs change
  useEffect(() => {
    if (currentLocation && (jobs.length > 0 || assignmentRequests.length > 0)) {
      calculateDistances();
    }
  }, [currentLocation, jobs, assignmentRequests]);

  // Realtime for assignment requests — no 5s polling; refresh when requests change
  useEffect(() => {
    if (!user?.technicianId) return;

    const technicianId = user.technicianId;
    const channel = supabase
      .channel(`technician-assignment-requests-${technicianId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'job_assignment_requests',
          filter: `technician_id=eq.${technicianId}`,
        },
        () => {
          loadAssignmentRequests();
          scheduleJobListSync();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.technicianId, scheduleJobListSync]);

  // Backup poll while tab is visible (assign/unassign also uses admin broadcast + postgres).
  useEffect(() => {
    if (!user?.technicianId) return;

    const pollInterval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void loadAssignedJobs();
    }, TECH_JOBS_POLL_MS);
    return () => clearInterval(pollInterval);
  }, [user?.technicianId, loadAssignedJobs]);

  // When realtime comes back, do a one-time sync to ensure list is correct.
  useEffect(() => {
    if (!user?.technicianId) return;
    if (!realtimeConnected) return;
    loadAssignedJobs();
  }, [realtimeConnected, user?.technicianId, loadAssignedJobs]);

  // Periodic location update (every 5 minutes) - ONLY when app is open and visible
  useEffect(() => {
    if (!user?.technicianId) {
      console.log('⏭️ [TechnicianDashboard] Periodic location update: No technician ID, skipping');
      return;
    }

    // Check if location tracking is enabled
    const locationTrackingEnabled = localStorage.getItem('technician_location_tracking_enabled') !== 'false';
    const settingValue = localStorage.getItem('technician_location_tracking_enabled');
    console.log('⏰ [TechnicianDashboard] Periodic location update check:', {
      settingValue,
      locationTrackingEnabled,
      willSetupInterval: locationTrackingEnabled
    });
    
    if (!locationTrackingEnabled) {
      console.log('🚫 [TechnicianDashboard] Location tracking is DISABLED - skipping periodic location updates');
      console.log('🚫 [TechnicianDashboard] - No automatic updates on mount');
      console.log('🚫 [TechnicianDashboard] - No 5-minute interval updates');
      console.log('🚫 [TechnicianDashboard] - No visibility / appState resume updates');
      return;
    }
    
    console.log('✅ [TechnicianDashboard] Location tracking ENABLED - setting up periodic updates');

    // visibilitychange + appStateChange often both fire on APK resume — only one GPS write.
    let lastResumeLocationAt = 0;
    const RESUME_DEDUPE_MS = 2_000;
    const requestLocationOnResume = (source: string) => {
      const stillEnabled = localStorage.getItem('technician_location_tracking_enabled') !== 'false';
      if (!stillEnabled || !user?.technicianId) return;
      const now = Date.now();
      if (now - lastResumeLocationAt < RESUME_DEDUPE_MS) {
        console.log('⏸️ [TechnicianDashboard] Resume location deduped', { source });
        return;
      }
      lastResumeLocationAt = now;
      console.log('🔄 [TechnicianDashboard] Resume — location update', { source });
      getCurrentLocation(true);
    };

    // Update location immediately on mount (only if page is visible)
    if (!document.hidden) {
      console.log('🔄 [TechnicianDashboard] Page visible on mount - triggering initial location update');
      lastResumeLocationAt = Date.now();
      getCurrentLocation(true);
    } else {
      console.log('⏸️ [TechnicianDashboard] Page hidden on mount - skipping initial location update');
    }

    // Then update every 5 minutes - ONLY if page is visible
    const locationInterval = setInterval(() => {
      // Check again if tracking is still enabled
      const stillEnabled = localStorage.getItem('technician_location_tracking_enabled') !== 'false';
      console.log('⏰ [TechnicianDashboard] 5-minute interval check:', {
        stillEnabled,
        pageVisible: !document.hidden,
        willUpdate: stillEnabled && !document.hidden
      });
      
      if (stillEnabled && !document.hidden) {
        console.log('🔄 [TechnicianDashboard] 5-minute interval - triggering location update');
        getCurrentLocation(true);
      } else if (!stillEnabled) {
        console.log('🚫 [TechnicianDashboard] Location tracking was disabled - stopping interval updates');
      }
    }, 5 * 60 * 1000); // 5 minutes

    // WebView signal — works on browser + most APK resumes
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        requestLocationOnResume('visibilitychange');
      }
    };

    // Native APK signal — catches OEMs that miss visibilitychange alone
    let removeAppListener: (() => void) | undefined;
    void import('@capacitor/app')
      .then(({ App }) =>
        App.addListener('appStateChange', ({ isActive }) => {
          if (isActive) requestLocationOnResume('appStateChange');
        })
      )
      .then((handle) => {
        removeAppListener = () => {
          void handle.remove();
        };
      })
      .catch(() => {
        /* web / plugin missing */
      });

    // Listen for storage changes (when setting is toggled in Settings page - cross-tab)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'technician_location_tracking_enabled') {
        const isEnabled = e.newValue !== 'false';
        if (isEnabled && !document.hidden && user?.technicianId) {
          console.log('Location tracking enabled - requesting location update');
          getCurrentLocation(true);
        }
      }
    };

    // Listen for custom event (when setting is toggled in same window)
    const handleLocationTrackingChanged = (e: CustomEvent) => {
      const isEnabled = e.detail?.enabled !== false;
      console.log('🔔 [TechnicianDashboard] Location tracking setting changed:', {
        enabled: isEnabled,
        pageVisible: !document.hidden,
        hasTechnicianId: !!user?.technicianId,
        willUpdate: isEnabled && !document.hidden && user?.technicianId
      });
      
      if (isEnabled && !document.hidden && user?.technicianId) {
        console.log('✅ [TechnicianDashboard] Location tracking ENABLED - requesting location update');
        getCurrentLocation(true);
      } else if (!isEnabled) {
        console.log('🚫 [TechnicianDashboard] Location tracking DISABLED - no updates will be made');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('locationTrackingChanged', handleLocationTrackingChanged as EventListener);

    return () => {
      clearInterval(locationInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('locationTrackingChanged', handleLocationTrackingChanged as EventListener);
      removeAppListener?.();
    };
  }, [user?.technicianId, getCurrentLocation]);

  // Filter jobs based on status
  useEffect(() => {
    let filtered = jobs;

    // Switching tabs clears any frozen ongoing order so the new tab sorts normally.
    if (prevStatusFilterForOrderRef.current !== statusFilter) {
      prevStatusFilterForOrderRef.current = statusFilter;
      ongoingOrderRef.current = null;
    }

    // Filter by status
    if (statusFilter === 'ONGOING') {
      filtered = filtered.filter(isOngoingJob);
    } else if (statusFilter === 'RESCHEDULED') {
      // Filter for follow-up jobs (FOLLOW_UP status)
      filtered = filtered.filter(job => normalizeJobStatus(job.status) === 'FOLLOW_UP');
    } else if (statusFilter === 'CANCELLED') {
      // Filter for denied jobs (DENIED status) - only show jobs denied by this technician today
      const technicianName = user?.fullName || '';
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Start of today
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1); // Start of tomorrow
      
      filtered = filtered.filter(job => {
        if (normalizeJobStatus(job.status) !== 'DENIED') return false;
        const deniedBy = (job as any).denied_by || job.deniedBy || '';
        const deniedAt = (job as any).denied_at || job.deniedAt || null;
        
        // Only show if denied by this technician (not by admin)
        if (!deniedBy || deniedBy === 'Admin' || deniedBy !== technicianName) return false;
        
        // Only show if denied today
        if (!deniedAt) return false;
        const deniedDate = new Date(deniedAt);
        return deniedDate >= today && deniedDate < tomorrow;
      });
    } else if (statusFilter === 'COMPLETED') {
      // Filter completed jobs - show today's or yesterday's completed jobs by this technician
      const now = new Date();
      const targetDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (completedDateFilter === 'yesterday' ? -1 : 0));
      const rY = targetDay.getFullYear(), rM = targetDay.getMonth(), rD = targetDay.getDate();

      filtered = filtered.filter(job => {
        const status = normalizeJobStatus((job as any).status || job.status);
        if (status !== 'COMPLETED') return false;

        const completedBy = (job as any).completed_by || (job as any).completedBy;
        const assignedToMe = (job as any).assigned_technician_id === user?.technicianId ||
          ((job as any).team_members && Array.isArray((job as any).team_members) && (job as any).team_members.includes(user?.technicianId));
        if (!completedBy && !assignedToMe) return false;
        if (completedBy && completedBy !== user?.technicianId && completedBy !== user?.id) return false;

        const completedAt = (job as any).completed_at || job.completedAt || (job as any).end_time || (job as any).endTime;
        if (!completedAt) return false;

        const completedDate = new Date(completedAt);
        const cY = completedDate.getFullYear(), cM = completedDate.getMonth(), cD = completedDate.getDate();
        return cY === rY && cM === rM && cD === rD;
      });
    } else if (statusFilter !== 'ALL') {
      filtered = filtered.filter(job => {
        const status = normalizeJobStatus((job as any).status || job.status);
        return status === statusFilter;
      });
    }

    // Sort jobs: Follow-up jobs scheduled for today first, then NEW jobs, then IN_PROGRESS/EN_ROUTE, then others
    // Completed tab: preserve visual order when only job data changes (e.g. add parts, then close dialog)
    const didSort = !shouldPreserveOrderRef.current;
    if (statusFilter === 'COMPLETED') {
      if (completedDateFilter !== lastCompletedDateFilterRef.current) {
        lastCompletedDateFilterRef.current = completedDateFilter;
        lastCompletedJobIdsOrderRef.current = [];
      }
      const currentIds = filtered.map((j) => j.id);
      const lastOrder = lastCompletedJobIdsOrderRef.current;
      const sameSetOfJobs =
        lastOrder.length === currentIds.length &&
        currentIds.every((id) => lastOrder.includes(id));
      if (sameSetOfJobs && lastOrder.length > 0) {
        // Same jobs (e.g. one updated in place) – keep previous order so list doesn’t jump
        const orderMap = new Map(lastOrder.map((id, i) => [id, i]));
        filtered.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
      } else {
        // New/removed job or first load – sort by completed_at descending
        filtered.sort((a, b) => {
          const ta = new Date((a as any).completed_at || (a as any).end_time || (a as any).completedAt || (a as any).endTime || 0).getTime();
          const tb = new Date((b as any).completed_at || (b as any).end_time || (b as any).completedAt || (b as any).endTime || 0).getTime();
          return tb - ta;
        });
        lastCompletedJobIdsOrderRef.current = filtered.map((j) => j.id);
      }
    } else if (
      visitOrderVisible &&
      statusFilter === 'ONGOING' &&
      filtered.some((j) => getJobVisitOrder(j) != null)
    ) {
      // Admin visit order wins — don't freeze session order so #1/#2 renumber as jobs finish.
      ongoingOrderRef.current = null;
      filtered.sort(compareJobsByVisitOrder);
    } else if (ongoingOrderRef.current && ongoingOrderRef.current.length > 0) {
      // Session order is frozen (e.g. the tech tapped Start) — keep every job in its
      // current on-screen slot so it doesn't jump, even across realtime refetches. Newly
      // arrived jobs are appended (newest first). A page reload clears this and re-sorts.
      const savedOrder = ongoingOrderRef.current;
      const orderMap = new Map(savedOrder.map((id, i) => [id, i] as const));
      const known = filtered.filter((j) => orderMap.has(j.id));
      const fresh = filtered.filter((j) => !orderMap.has(j.id));
      known.sort((a, b) => (orderMap.get(a.id)! - orderMap.get(b.id)!));
      fresh.sort(
        (a, b) =>
          new Date((b as any).created_at || (b as any).createdAt || 0).getTime() -
          new Date((a as any).created_at || (a as any).createdAt || 0).getTime()
      );
      filtered = [...known, ...fresh];
      ongoingOrderRef.current = filtered.map((j) => j.id);
    } else if (didSort) {
      filtered.sort((a, b) => {
      // Prefer admin visit order when present (even if only some jobs have it).
      if (visitOrderVisible) {
        const visitCmp = compareJobsByVisitOrder(a, b);
        if (getJobVisitOrder(a) != null || getJobVisitOrder(b) != null) {
          return visitCmp;
        }
      }

      const statusA = (a as any).status || a.status;
      const statusB = (b as any).status || b.status;
      
      // Helper function to check if follow-up is scheduled for today
      const isFollowUpToday = (job: Job) => {
        const jobStatus = (job as any).status || job.status;
        if (jobStatus !== 'FOLLOW_UP') return false;
        
        const followUpDate = (job as any).follow_up_date || job.followUpDate;
        if (!followUpDate) return false;
        
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        
        let followUpStr = '';
        if (followUpDate.includes('T')) {
          const followUp = new Date(followUpDate);
          followUpStr = `${followUp.getFullYear()}-${String(followUp.getMonth() + 1).padStart(2, '0')}-${String(followUp.getDate()).padStart(2, '0')}`;
        } else {
          followUpStr = followUpDate.split('T')[0];
        }
        
        return todayStr === followUpStr;
      };
      
      // Priority 1: Follow-up jobs scheduled for today - at the very top
      const isFollowUpTodayA = statusA === 'FOLLOW_UP' && isFollowUpToday(a);
      const isFollowUpTodayB = statusB === 'FOLLOW_UP' && isFollowUpToday(b);
      
      if (isFollowUpTodayA && !isFollowUpTodayB) return -1;
      if (!isFollowUpTodayA && isFollowUpTodayB) return 1;
      
      // Priority 2: IN_PROGRESS and EN_ROUTE (active jobs)
      const isActiveA = statusA === 'IN_PROGRESS' || statusA === 'EN_ROUTE';
      const isActiveB = statusB === 'IN_PROGRESS' || statusB === 'EN_ROUTE';
      
      if (isActiveA && !isActiveB) return -1;
      if (!isActiveA && isActiveB) return 1;
      
      // If both active, IN_PROGRESS comes before EN_ROUTE
      if (isActiveA && isActiveB) {
        if (statusA === 'IN_PROGRESS' && statusB === 'EN_ROUTE') return -1;
        if (statusA === 'EN_ROUTE' && statusB === 'IN_PROGRESS') return 1;
      }
      
      // Priority 3: Sort ASSIGNED jobs by created_at (newest first) - maintain position regardless of seen status
      if (statusA === 'ASSIGNED' && statusB === 'ASSIGNED') {
        const createdA = new Date((a as any).created_at || a.createdAt || 0).getTime();
        const createdB = new Date((b as any).created_at || b.createdAt || 0).getTime();
        return createdB - createdA;
      }
      
      // Priority 4: Sort by created_at (newest first) for all other jobs
      const createdA = new Date((a as any).created_at || a.createdAt || 0).getTime();
      const createdB = new Date((b as any).created_at || b.createdAt || 0).getTime();
      return createdB - createdA;
      });
    }
    // Only reset preserve-order flag when we actually sorted (so in-place updates e.g. add parts keep list order)
    if (didSort) shouldPreserveOrderRef.current = false;

    setFilteredJobs(filtered);
  }, [jobs, statusFilter, seenJobs, completedDateFilter, user?.technicianId, user?.id, visitOrderVisible]);

  // Newly assigned jobs the technician hasn't acknowledged yet (drives the blocking alert).
  const newAssignedJobs = useMemo(
    () =>
      jobs.filter(
        (j) =>
          normalizeJobStatus((j as any).status ?? j.status) === 'ASSIGNED' &&
          !seenJobs.has(j.id)
      ),
    [jobs, seenJobs]
  );

  // Pop the alert whenever there are unacknowledged new jobs (e.g. a fresh realtime
  // assignment); close it automatically once none remain.
  useEffect(() => {
    setNewJobsAlertOpen(newAssignedJobs.length > 0);
  }, [newAssignedJobs.length]);

  const loadAssignmentRequests = async (retryCount = 0) => {
    if (!user?.technicianId) return;

    try {
      setAssignmentRequestsLoading(true);
      const { data, error } = await db.jobAssignmentRequests.getPendingByTechnicianId(user.technicianId);
      
      if (error) {
        // Retry on network errors (up to 2 retries)
        if (retryCount < 2 && (error.message.includes('fetch') || error.message.includes('network') || error.message.includes('Failed to fetch'))) {
          console.log(`Retrying loadAssignmentRequests (attempt ${retryCount + 1}/2)...`);
          await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1))); // Exponential backoff
          return loadAssignmentRequests(retryCount + 1);
        }
        throw new Error(error.message);
      }

      setAssignmentRequests(data || []);
      
      // Load AMC status for customers in assignment requests
      if (data && data.length > 0) {
        const customerIds = data.map((request: any) => {
          const job = request.job as any;
          return job?.customer_id || job?.customer?.id;
        }).filter(Boolean);
        
        if (customerIds.length > 0) {
          const { data: amcContracts } = await supabase
            .from('amc_contracts')
            .select('customer_id, status')
            .in('customer_id', customerIds)
            .eq('status', 'ACTIVE');
          
          const amcStatusMap: Record<string, boolean> = {};
          if (amcContracts) {
            amcContracts.forEach((amc: any) => {
              amcStatusMap[amc.customer_id] = true;
            });
          }
          // Merge with existing AMC status
          setCustomerAMCStatus(prev => ({ ...prev, ...amcStatusMap }));
        }
      }
    } catch (error) {
      console.error('Error loading assignment requests:', error);
      // Don't show toast messages - errors are logged to console for debugging
      // Assignment requests will retry automatically on next refresh
    } finally {
      setAssignmentRequestsLoading(false);
    }
  };

  const resumeTechnicianSync = useCallback(async () => {
    if (!user?.technicianId) return;

    const session = await ensureSupabaseSessionForWrite();
    if (!session.ok) {
      console.warn('[TechnicianDashboard] Resume sync skipped — session not ready');
      return;
    }

    await Promise.all([loadAssignedJobs(), loadAssignmentRequests()]);

    const t = Date.now();
    if (t - lastQrRefreshOnFocusRef.current > 300_000) {
      lastQrRefreshOnFocusRef.current = t;
      loadQrCodes({ force: true });
    }
  }, [user?.technicianId, loadAssignedJobs, loadQrCodes]);

  useResumeSync({
    enabled: !!user?.technicianId,
    minHiddenMs: 60_000,
    minIntervalMs: 15_000,
    onResume: resumeTechnicianSync,
  });

  const handleAssignmentResponse = async (requestId: string, status: 'ACCEPTED' | 'REJECTED') => {
    if (!user?.technicianId) return;

    try {
      setIsResponding(true);
      
      // First, check if this request is still valid (not already accepted by someone else)
      const currentRequest = assignmentRequests.find(req => req.id === requestId);
      if (!currentRequest) {
        toast.error('This assignment request is no longer available');
        return;
      }

      const { error } = await db.jobAssignmentRequests.respondToRequest(
        requestId, 
        status, 
        responseNotes || undefined
      );

      if (error) {
        // Handle specific case where request was already processed
        if (error.code === 'ALREADY_PROCESSED') {
          toast.error('This job has already been accepted by another technician');
          // Refresh the assignment requests to remove this one
          await loadAssignmentRequests();
          return;
        }
        throw new Error(error.message);
      }

      // If accepted, reload both assignment requests and assigned jobs
      if (status === 'ACCEPTED') {
        // Reload assignment requests to remove any cancelled ones
        await loadAssignmentRequests();
        // Reload assigned jobs to show the newly assigned job
        await loadAssignedJobs();
      } else {
        // If rejected, just remove this request
        setAssignmentRequests(prev => prev.filter(req => req.id !== requestId));
      }

      // Send notification to admin
      const request = assignmentRequests.find(req => req.id === requestId);
      if (request?.job) {
        const job = request.job as any;
        const customer = job.customer as any;
        
        const notification = status === 'ACCEPTED' 
          ? createJobAssignmentAcceptedNotification(
              job.job_number,
              customer?.full_name || 'Customer',
              user?.fullName || 'Technician',
              job.id
            )
          : createJobAssignmentRejectedNotification(
              job.job_number,
              customer?.full_name || 'Customer',
              user?.fullName || 'Technician',
              job.id
            );
        
        await sendNotification(notification);
      }

        // Job assignment response processed silently
      setSelectedRequest(null);
      setResponseNotes('');
    } catch (error) {
      console.error('Error responding to assignment request:', error);
      toast.error('Failed to respond to assignment request');
    } finally {
      setIsResponding(false);
    }
  };

  // Mark job as seen (remove blue border after interaction)
  const markJobAsSeen = (jobId: string) => {
    setSeenJobs(prev => {
      const updated = new Set(prev).add(jobId);
      // Persist to localStorage
      try {
        localStorage.setItem('technician_seen_jobs', JSON.stringify(Array.from(updated)));
      } catch (error) {
        console.error('Error saving seen jobs to localStorage:', error);
      }
      return updated;
    });
  };

  // Mark several jobs seen at once (single localStorage write) — used by the new-jobs alert.
  const markJobsAsSeen = (jobIds: string[]) => {
    if (jobIds.length === 0) return;
    setSeenJobs(prev => {
      const updated = new Set(prev);
      for (const id of jobIds) updated.add(id);
      try {
        localStorage.setItem('technician_seen_jobs', JSON.stringify(Array.from(updated)));
      } catch (error) {
        console.error('Error saving seen jobs to localStorage:', error);
      }
      return updated;
    });
  };

  // Acknowledge all currently-new assigned jobs: mark them seen, close the alert, and
  // jump to the Ongoing tab so the technician actually lands on the new jobs.
  const acknowledgeNewJobs = () => {
    markJobsAsSeen(newAssignedJobs.map(j => j.id));
    setNewJobsAlertOpen(false);
    // Re-sort the ongoing list so the acknowledged jobs land in their proper position.
    ongoingOrderRef.current = null;
    prevStatusFilterForOrderRef.current = 'ONGOING';
    setStatusFilter('ONGOING');
  };

  // Check if another job is in progress
  const hasJobInProgress = (): boolean => {
    return jobs.some(job => {
      const status = (job as any).status || job.status;
      return status === 'IN_PROGRESS' || status === 'EN_ROUTE';
    });
  };

  // Return the active (EN_ROUTE / IN_PROGRESS) job, optionally ignoring one id (the job
  // being started). Used to warn the tech before they start a second job at once.
  const getActiveJob = (excludeJobId?: string): Job | null => {
    return (
      jobs.find(job => {
        if (excludeJobId && job.id === excludeJobId) return false;
        const status = normalizeJobStatus((job as any).status ?? job.status);
        return status === 'IN_PROGRESS' || status === 'EN_ROUTE';
      }) ?? null
    );
  };

  // Small amber "you already have a job going" notice for the start dialogs.
  const ActiveJobWarning: React.FC<{ activeJob: Job }> = ({ activeJob }) => {
    const c = activeJob.customer as any;
    const name = c?.full_name || c?.fullName || 'another customer';
    const status = normalizeJobStatus((activeJob as any).status ?? activeJob.status);
    const statusLabel = status === 'EN_ROUTE' ? 'on the way' : 'in progress';
    return (
      <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
        <span>
          You're already <strong>{statusLabel}</strong> with{' '}
          <span className="font-semibold">{name}</span>. Finish that job first, or start
          this one only if you've switched. Two jobs at once can cause mix-ups.
        </span>
      </div>
    );
  };

  /** When admin set visit order AND Tools toggle is on, find if this job skips an earlier stop. */
  const getVisitOrderSkipInfo = (job: Job): { rank: number; firstJob: Job } | null => {
    if (!visitOrderVisible) return null;
    const ordered =
      statusFilter === 'ONGOING'
        ? filteredJobs.filter(isOngoingJob)
        : jobs.filter(isOngoingJob).sort(compareJobsByVisitOrder);
    if (ordered.length < 2) return null;
    if (!ordered.some((j) => getJobVisitOrder(j) != null)) return null;
    const idx = ordered.findIndex((j) => j.id === job.id);
    if (idx <= 0) return null;
    return { rank: idx + 1, firstJob: ordered[0] };
  };

  const proceedAfterVisitOrderCheck = (job: Job, action: 'start' | 'startWork' | 'startAndOpenMap') => {
    if (action === 'start') {
      setConfirmStartJobDialog({ open: true, job });
    } else if (action === 'startWork') {
      void openStartWorkConfirm(job);
    } else if (action === 'startAndOpenMap') {
      void (async () => {
        const ok = await performStartJob(job);
        if (ok) await openMapForJobDirect(job);
      })();
    }
  };

  // Handle starting job (going to location) - EN_ROUTE status
  const handleStartJob = async (job: Job) => {
    if (!user?.technicianId) return;

    const skip = getVisitOrderSkipInfo(job);
    if (skip) {
      setVisitOrderSkipDialog({
        open: true,
        job,
        action: 'start',
        rank: skip.rank,
        firstJob: skip.firstJob,
      });
      return;
    }

    // Always show confirmation dialog
    setConfirmStartJobDialog({ open: true, job });
  };

  // Actually perform the start job action. Returns true when EN_ROUTE was set.
  const performStartJob = async (job: Job): Promise<boolean> => {
    if (!user?.technicianId) return false;

    try {
      setIsUpdating(true);
      processingJobsRef.current.add(job.id);
      
      // Mark as seen (remove blue border)
      markJobAsSeen(job.id);
      

      // Update job status to EN_ROUTE (going to job location)
      const { error } = await db.jobs.update(job.id, {
        status: 'EN_ROUTE' as any,
      });

      if (error) {
        throw new Error(error.message);
      }

      // Tell the office phones the technician is heading out (HRO Admin app push).
      void import('@/lib/notifyAdminsJobEvent').then(({ notifyAdminsJobEvent }) =>
        notifyAdminsJobEvent(job.id, 'en_route')
      );

      // Freeze the current on-screen order so this job stays where it is instead of
      // jumping to the top now; a fresh page load will re-sort (active jobs on top).
      ongoingOrderRef.current = filteredJobs.map(j => j.id);
      // Update local state - preserve order (don't re-sort)
      shouldPreserveOrderRef.current = true;
      setJobs(prev => {
        const exists = prev.some(j => j.id === job.id);
        if (exists) {
          return prev.map(j => j.id === job.id ? { ...j, status: 'EN_ROUTE' as any } : j);
        }
        return [{ ...job, status: 'EN_ROUTE' as any }, ...prev];
      });

      // Job started silently
      
      setTimeout(() => {
        processingJobsRef.current.delete(job.id);
      }, 30000);
      return true;
    } catch (error: any) {
      console.error('Error starting job:', error);
      const errorMessage = error?.message || 'Failed to start job';
      toast.error(errorMessage);
      // If it's a constraint error, provide helpful message
      if (errorMessage.includes('EN_ROUTE') || errorMessage.includes('constraint') || errorMessage.includes('check')) {
        toast.error('EN_ROUTE status not allowed. Please run the migration: add-en-route-status.sql', {
          duration: 8000,
        });
      }
      processingJobsRef.current.delete(job.id);
      return false;
    } finally {
      setIsUpdating(false);
    }
  };

  /** Maps dialog Yes: start job (with visit-order check) then open Maps. */
  const startJobAndOpenMap = (job: Job) => {
    const skip = getVisitOrderSkipInfo(job);
    if (skip) {
      setVisitOrderSkipDialog({
        open: true,
        job,
        action: 'startAndOpenMap',
        rank: skip.rank,
        firstJob: skip.firstJob,
      });
      return;
    }
    void (async () => {
      const ok = await performStartJob(job);
      if (ok) await openMapForJobDirect(job);
    })();
  };

  // Handle starting work at location - IN_PROGRESS status
  const handleStartWork = async (job: Job) => {
    if (!user?.technicianId) return;

    const skip = getVisitOrderSkipInfo(job);
    if (skip) {
      setVisitOrderSkipDialog({
        open: true,
        job,
        action: 'startWork',
        rank: skip.rank,
        firstJob: skip.firstJob,
      });
      return;
    }

    void openStartWorkConfirm(job);
  };

  /**
   * Open Start Work confirm only after OTP status is known — otherwise the OTP
   * boxes flash for a split second when Ask OTP already captured the code.
   */
  const openStartWorkConfirm = async (job: Job) => {
    setStartWorkOtp('');
    setStartWorkOtpError('');

    let jobForDialog = job;
    if (jobRequiresOtp(job) && !getJobEnteredOtp(job)) {
      try {
        const [{ data: fresh }, answered] = await Promise.all([
          supabase.from('jobs').select('requirements').eq('id', job.id).maybeSingle(),
          getSubmittedOtpForJob(job.id),
        ]);
        let reqs = parseJobRequirements(
          (fresh as { requirements?: unknown } | null)?.requirements ??
            (job as any).requirements ??
            job.requirements
        );
        const fromJob = getStoredOtpFromRequirements(reqs);
        const entered = fromJob || answered;
        if (entered) {
          if (!fromJob && answered) {
            reqs = applyOtpToRequirements(reqs, answered);
          }
          jobForDialog = { ...job, requirements: reqs as any };
          setJobs((prev) =>
            prev.map((j) => (j.id === job.id ? { ...j, requirements: reqs as any } : j))
          );
        }
      } catch {
        /* open with local job */
      }
    }

    setConfirmStartWorkDialog({ open: true, job: jobForDialog });
  };

  // Actually perform the start work action
  const performStartWork = async (job: Job, customerOtp?: string) => {
    if (!user?.technicianId) return;

    try {
      setIsUpdating(true);
      processingJobsRef.current.add(job.id);
      
      markJobAsSeen(job.id);

      // If the customer's OTP was collected in the Start Work dialog, store it in
      // the same requirements JSON slot the completion flow uses — no extra table,
      // and the admin Completed section keeps showing it later. Re-fetch just the
      // requirements column first (tiny select, OTP jobs only) so we merge into
      // the latest server state instead of clobbering admin edits made after the
      // job list was loaded.
      let updatedRequirements: any[] | undefined;
      let shouldPushOtp = false;
      if (customerOtp && /^\d{4}$/.test(customerOtp)) {
        let baseRequirements: any[] | null = null;
        try {
          const { data: freshJob } = await supabase
            .from('jobs')
            .select('requirements')
            .eq('id', job.id)
            .maybeSingle();
          if (freshJob) baseRequirements = parseJobRequirements((freshJob as any).requirements);
        } catch {
          // Offline/fetch failure: fall back to the local copy below.
        }
        const base =
          baseRequirements ?? parseJobRequirements((job as any).requirements ?? job.requirements);
        // Already entered via Ask OTP / notification — store if needed, never re-push.
        const alreadyHad = getStoredOtpFromRequirements(base);
        shouldPushOtp = !alreadyHad;
        updatedRequirements = applyOtpToRequirements(base, customerOtp);
      }

      // Update job status to IN_PROGRESS (at location, working)
      const { error } = await db.jobs.update(job.id, {
        status: 'IN_PROGRESS',
        start_time: new Date().toISOString(),
        ...(updatedRequirements ? { requirements: updatedRequirements as any } : {}),
      });

      if (error) {
        throw new Error(error.message);
      }

      // Push only the first time this job gets an OTP (Ask OTP may have pushed already).
      if (shouldPushOtp && customerOtp) {
        void import('@/lib/notifyAdminsJobEvent').then(({ notifyAdminsJobEvent }) =>
          notifyAdminsJobEvent(job.id, 'otp_entered', { otp: customerOtp })
        );
      }

      // Clear the home-page Ask OTP card if office had already requested this job.
      if (customerOtp && /^\d{4}$/.test(customerOtp)) {
        void markOtpRequestAnsweredForJob(job.id, customerOtp);
      }

      // Freeze the current on-screen order so this job stays where it is instead of
      // jumping to the top now; a fresh page load will re-sort (active jobs on top).
      ongoingOrderRef.current = filteredJobs.map(j => j.id);
      // Update local state - preserve order (don't re-sort)
      shouldPreserveOrderRef.current = true;
      setJobs(prev => prev.map(j => 
        j.id === job.id 
          ? {
              ...j,
              status: 'IN_PROGRESS' as any,
              start_time: new Date().toISOString(),
              ...(updatedRequirements ? { requirements: updatedRequirements as any } : {}),
            }
          : j
      ));

      // Work started silently
      
      setTimeout(() => {
        processingJobsRef.current.delete(job.id);
      }, 30000);
    } catch (error) {
      console.error('Error starting work:', error);
      toast.error('Failed to start work');
      processingJobsRef.current.delete(job.id);
    } finally {
      setIsUpdating(false);
    }
  };

  // Calculate AMC end date helper (must be defined before handleCompleteJob)
  const calculateAMCEndDate = (agreementDate: string, years: number) => {
    if (!agreementDate) return;
    const startDate = new Date(agreementDate);
    const endDate = new Date(startDate);
    endDate.setFullYear(endDate.getFullYear() + years);
    // Subtract 1 day (AMC covers up to that date - 1 day)
    endDate.setDate(endDate.getDate() - 1);
    setAmcEndDate(endDate.toISOString().split('T')[0]);
  };

  useEffect(() => {
    if (!completeDialogOpen || completeJobStep !== 3 || hasAMC !== true || !selectedJobForComplete) {
      setCompleteJobCustomerDoc(null);
      return;
    }

    const raw = selectedJobForComplete.customer as Record<string, unknown> | undefined;
    const customerId =
      (raw?.id as string | undefined) ||
      selectedJobForComplete.customer_id ||
      (selectedJobForComplete as { customerId?: string }).customerId;

    if (!customerId) return;

    let cancelled = false;

    const fallbackCustomer = (): Customer => ({
      id: String(customerId),
      customerId: String(raw?.customer_id || raw?.customerId || ''),
      fullName: String(raw?.full_name || raw?.fullName || 'Customer'),
      phone: String(raw?.phone || ''),
      email: String(raw?.email || ''),
      address: normalizeCustomerAddress(raw?.address, {
        visible_address: raw?.visible_address,
      }),
      location: { latitude: 0, longitude: 0, formattedAddress: '' },
      serviceType: 'RO',
      brand: String(raw?.brand || ''),
      model: String(raw?.model || ''),
      status: 'ACTIVE',
      customerSince: '',
      ...mapCustomerGstFields(raw as { gstNumber?: string; gst_number?: string }),
    });

    void (async () => {
      const { data, error } = await db.customers.getByIdForDocuments(String(customerId));
      if (cancelled) return;
      if (error || !data) {
        setCompleteJobCustomerDoc(fallbackCustomer());
        return;
      }
      const row = data as Record<string, unknown>;
      setCompleteJobCustomerDoc({
        id: String(row.id),
        customerId: String(row.customer_id || ''),
        fullName: String(row.full_name || 'Customer'),
        phone: String(row.phone || ''),
        email: String(row.email || ''),
        address: normalizeCustomerAddress(row.address, {
          visible_address: row.visible_address,
        }),
        location: { latitude: 0, longitude: 0, formattedAddress: '' },
        serviceType: (row.service_type as Customer['serviceType']) || 'RO',
        brand: String(row.brand || ''),
        model: String(row.model || ''),
        status: 'ACTIVE',
        customerSince: String(row.customer_since || ''),
        ...mapCustomerGstFields(row as { gstNumber?: string; gst_number?: string }),
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [completeDialogOpen, completeJobStep, hasAMC, selectedJobForComplete]);

  const technicianReferenceAmcBill = useMemo(() => {
    if (hasAMC !== true || amcYears <= 0) return null;
    if (!amcDateGiven || !amcEndDate || !amcAmount.trim()) return null;
    if (amcIncludesPrefilter === null || !amcServicePeriodKind) return null;
    const amount = parseFloat(amcAmount);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    const documentBrand = normalizeDocumentBrand(serviceBrand);
    if (!documentBrand || !completeJobCustomerDoc || !selectedJobForComplete) return null;

    return buildTechnicianReferenceAmcBill({
      customer: completeJobCustomerDoc,
      documentBrand,
      billNumber: suggestReferenceAmcBillNumber(selectedJobForComplete.jobNumber),
      startDate: amcDateGiven,
      endDate: amcEndDate,
      years: amcYears,
      amount,
      includesPrefilter: amcIncludesPrefilter === true,
      servicePeriodKind: amcServicePeriodKind,
      servicePeriodCustomMonths: amcServicePeriodCustomMonths,
    });
  }, [
    hasAMC,
    amcYears,
    amcDateGiven,
    amcEndDate,
    amcAmount,
    amcIncludesPrefilter,
    amcServicePeriodKind,
    amcServicePeriodCustomMonths,
    serviceBrand,
    completeJobCustomerDoc,
    selectedJobForComplete,
  ]);

  const persistTechnicianAmcForShare = useCallback(async (options?: {
    sharedVia?: 'technician_download' | 'technician_email';
    emailedTo?: string[];
    customerEmailOverride?: string;
  }): Promise<{ ok: boolean; error?: string }> => {
    if (!technicianReferenceAmcBill || !completeJobCustomerDoc || !selectedJobForComplete) {
      return { ok: false, error: 'Complete all AMC fields first' };
    }

    const sessionReady = await ensureSupabaseSessionForWrite();
    if (!sessionReady.ok) {
      return { ok: false, error: 'Could not refresh your session. Please try again in a moment.' };
    }

    const { data: { user: authUser } } = await supabase.auth.getUser();
    const technicianId = authUser?.id || user?.technicianId || user?.id;
    if (!technicianId) {
      return { ok: false, error: 'Technician session not found' };
    }

    const documentBrand = normalizeDocumentBrand(serviceBrand);
    if (!documentBrand) {
      return { ok: false, error: 'Select service brand on step 1' };
    }

    const accessToken = await resolveSupabaseAccessTokenForApi();
    if (!accessToken) {
      return { ok: false, error: 'Could not refresh your session. Please try again in a moment.' };
    }

    const servicePeriodMonths =
      amcServicePeriodKind === 'no_auto'
        ? 0
        : amcServicePeriodKind === '4'
          ? 4
          : amcServicePeriodKind === '6'
            ? 6
            : Math.max(1, amcServicePeriodCustomMonths);

    const roModel =
      [completeJobCustomerDoc.brand, completeJobCustomerDoc.model].filter(Boolean).join(' ').trim() ||
      undefined;

    const payload = buildTechnicianAmcPersistPayload({
      billNumber: technicianReferenceAmcBill.billNumber,
      customerId: completeJobCustomerDoc.id,
      customerName: completeJobCustomerDoc.fullName,
      customerPhone: completeJobCustomerDoc.phone || '',
      customerEmail: options?.customerEmailOverride ?? completeJobCustomerDoc.email,
      customerAddress: completeJobCustomerDoc.address,
      jobId: selectedJobForComplete.id,
      jobNumber: selectedJobForComplete.jobNumber,
      startDate: amcDateGiven,
      endDate: amcEndDate,
      years: amcYears,
      amount: parseFloat(amcAmount),
      includesPrefilter: amcIncludesPrefilter === true,
      servicePeriodMonths,
      serviceBrand: documentBrand,
      technicianId,
      roModel,
      additionalInfo: amcAdditionalInfo,
      sharedVia: options?.sharedVia ?? 'technician_download',
      emailedTo: options?.emailedTo,
    });

    const result = await persistAmcContract(payload, accessToken);
    if (result.ok) {
      amcContractPersistedKeyRef.current = `${selectedJobForComplete.id}:${documentBrand}`;
      setCustomerAMCStatus((prev) => ({ ...prev, [completeJobCustomerDoc.id]: true }));
    }
    return result;
  }, [
    technicianReferenceAmcBill,
    completeJobCustomerDoc,
    selectedJobForComplete,
    user?.technicianId,
    user?.id,
    serviceBrand,
    amcDateGiven,
    amcEndDate,
    amcAmount,
    amcYears,
    amcIncludesPrefilter,
    amcServicePeriodKind,
    amcServicePeriodCustomMonths,
    amcAdditionalInfo,
  ]);

  const saveCustomerEmailForAmc = useCallback(
    async (email: string): Promise<{ ok: boolean; error?: string }> => {
      if (!completeJobCustomerDoc?.id) {
        return { ok: false, error: 'Customer not found' };
      }

      const trimmed = email.trim();
      if (!trimmed) {
        return { ok: false, error: 'Enter a valid email address' };
      }

      const sessionReady = await ensureSupabaseSessionForWrite();
      if (!sessionReady.ok) {
        return {
          ok: false,
          error: 'Could not refresh your session. Please try again in a moment.',
        };
      }

      const jobId = selectedJobForComplete?.id;
      const { error } = jobId
        ? await db.customers.updateByTechnician(completeJobCustomerDoc.id, jobId, {
            email: trimmed,
          })
        : await db.customers.update(completeJobCustomerDoc.id, { email: trimmed });
      if (error) {
        return { ok: false, error: error.message || 'Could not save customer email' };
      }

      setCompleteJobCustomerDoc((prev) => (prev ? { ...prev, email: trimmed } : prev));
      return { ok: true };
    },
    [completeJobCustomerDoc?.id, selectedJobForComplete?.id]
  );

  const patchJobCustomerInState = useCallback(
    (customerId: string, patch: TechnicianCustomerUpdatePatch) => {
      const applyPatch = (customer: Record<string, unknown> | undefined) => {
        if (!customer) return customer;
        const cid = String(customer.id || '');
        if (cid !== customerId) return customer;
        const next = { ...customer };
        if (patch.email !== undefined) next.email = patch.email;
        if (patch.alternate_phone !== undefined) {
          next.alternate_phone = patch.alternate_phone;
          next.alternatePhone = patch.alternate_phone;
        }
        return next;
      };

      setJobs((prev) =>
        prev.map((job) => {
          const patched = applyPatch(job.customer as Record<string, unknown> | undefined);
          if (patched === job.customer) return job;
          return { ...job, customer: patched as Job['customer'] };
        })
      );

      setAssignmentRequests((prev) =>
        prev.map((req) => {
          const job = req.job as Job | undefined;
          if (!job?.customer) return req;
          const patched = applyPatch(job.customer as Record<string, unknown>);
          if (patched === job.customer) return req;
          return { ...req, job: { ...job, customer: patched as Job['customer'] } };
        })
      );

      if (completeJobCustomerDoc?.id === customerId) {
        setCompleteJobCustomerDoc((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            ...(patch.email !== undefined ? { email: String(patch.email) } : {}),
            ...(patch.alternate_phone !== undefined
              ? { alternatePhone: String(patch.alternate_phone), alternate_phone: String(patch.alternate_phone) }
              : {}),
          };
        });
      }
    },
    [completeJobCustomerDoc?.id]
  );

  const openCustomerUpdateDialog = useCallback((job: Job) => {
    window.setTimeout(() => {
      setCustomerUpdateDialogJob(job);
    }, 120);
  }, []);

  const openCompletionSetReminder = useCallback(() => {
    if (!selectedJobForComplete) return;
    const customer = selectedJobForComplete.customer as Record<string, unknown> | undefined;
    const customerId =
      (customer?.id as string | undefined) ||
      selectedJobForComplete.customer_id ||
      (selectedJobForComplete as { customerId?: string }).customerId;
    if (!customerId) return;
    setReminderEntity({ type: 'customer', id: String(customerId) });
    const name = String(customer?.full_name || customer?.fullName || 'Customer');
    const code = String(customer?.customer_id || customer?.customerId || '');
    setReminderContextLabel(code ? `${name} (${code})` : name);
    setAddReminderDialogOpen(true);
  }, [selectedJobForComplete]);

  // Handle completing job - opens completion dialog
  const handleCompleteJob = async (job: Job) => {
    // Show confirmation dialog first
    setConfirmCompleteJobDialog({ open: true, job });
  };

  const resetCompleteJobFormState = useCallback(() => {
    setCompletionNotes('');
    setCompleteJobStep(1);
    setBillAmount('');
    setBillPhotos([]);
    setBillPhotoSources({});
    setOptionalCompletionPhotos([]);
    setCustomerHasZeroPhotosAltogether(false);
    setExtraPhotosStep6([]);
    setDontSendMessageToCustomer(false);
    setAskForReview(true);
    const today = new Date().toISOString().split('T')[0];
    setAmcDateGiven(today);
    setAmcYears(0);
    setAmcEndDate('');
    setAmcIncludesPrefilter(null);
    setHasAMC(null);
    setCompleteJobCustomerDoc(null);
    amcContractPersistedKeyRef.current = null;
    setAmcAdditionalInfo('');
    setAmcAmount('');
    setAmcServicePeriodKind('');
    setAmcServicePeriodCustomMonths(4);
    setPaymentScreenshot('');
    setPaymentMode('');
    setPartialCashAmount('');
    setPartialOnlineAmount('');
    setPendingPaidTodayEnabled(false);
    setPendingPaidTodayMode('');
    setPendingPaidTodayAmount('');
    setPromisedPaymentDate('');
    setCustomerHasPrefilter(null);
    setRawWaterTds('');
    setQrCodeType('');
    setSelectedQrCodeId('');
    setShareLinkUpiQrId('');
    setSelectedQrCodeName('');
    setSelectedQrCodeUrlState('');
    setOtpInput(['', '', '', '']);
    setOtpError('');
    otpInputRefs.current = [];
    setServiceBrand(null);
    setLastServiceBrand(null);
    setIsLoadingServiceBrand(false);
    setCompletionSubmitError(null);
    setCompletionRetryPhaseBOnly(false);
    setBillPhotosSkipConfirmOpen(false);
    setIsSubmittingJobCompletion(false);
    phaseASavedAtRef.current = null;
    phaseASnapshotRef.current = null;
  }, []);

  const phaseASavedAtRef = useRef<number | null>(null);
  /**
   * Snapshot of the Phase-A payload taken right after Phase A persists. Used
   * to detect whether the user has edited any field that affects Phase A
   * since Phase A was saved (#4). If anything changes, retry mode flips off
   * so the next submit re-runs Phase A + B with the new values instead of
   * silently flipping status with stale server data.
   */
  const phaseASnapshotRef = useRef<string | null>(null);

  const computePhaseAFingerprint = useCallback(() => {
    return JSON.stringify([
      billAmount,
      [...billPhotos].sort(),
      [...optionalCompletionPhotos].sort(),
      [...extraPhotosStep6].sort(),
      paymentMode,
      partialCashAmount,
      partialOnlineAmount,
      pendingPaidTodayEnabled,
      pendingPaidTodayMode,
      pendingPaidTodayAmount,
      promisedPaymentDate,
      selectedQrCodeId,
      shareLinkUpiQrId,
      paymentScreenshot,
      hasAMC,
      amcYears,
      amcDateGiven,
      amcEndDate,
      amcAmount,
      amcAdditionalInfo,
      amcServicePeriodKind,
      amcServicePeriodCustomMonths,
      amcIncludesPrefilter,
      dontSendMessageToCustomer,
      completionNotes,
      otpInput.join(''),
      serviceBrand,
      // Saved on completion (afterJobCompletionSaved) — must invalidate
      // retry-only mode if the tech goes Back and changes these (#4).
      customerHasPrefilter,
      rawWaterTds,
    ]);
  }, [
    billAmount,
    billPhotos,
    optionalCompletionPhotos,
    extraPhotosStep6,
    paymentMode,
    partialCashAmount,
    partialOnlineAmount,
    pendingPaidTodayEnabled,
    pendingPaidTodayMode,
    pendingPaidTodayAmount,
    promisedPaymentDate,
    selectedQrCodeId,
    shareLinkUpiQrId,
    paymentScreenshot,
    hasAMC,
    amcYears,
    amcDateGiven,
    amcEndDate,
    amcAmount,
    amcAdditionalInfo,
    amcServicePeriodKind,
    amcServicePeriodCustomMonths,
    amcIncludesPrefilter,
    dontSendMessageToCustomer,
    completionNotes,
    otpInput,
    serviceBrand,
    customerHasPrefilter,
    rawWaterTds,
  ]);

  // #4 If retry mode is active and the user edits any Phase-A field, flip
  // retry mode off so the next submit does a full save rather than only
  // re-running Phase B with stale server data. If retry mode just turned on
  // (e.g. after resuming a saved draft) and we don't yet have a snapshot,
  // capture the current fingerprint so subsequent edits can be detected.
  useEffect(() => {
    if (!completionRetryPhaseBOnly) {
      return;
    }
    if (!phaseASnapshotRef.current) {
      phaseASnapshotRef.current = computePhaseAFingerprint();
      return;
    }
    if (computePhaseAFingerprint() !== phaseASnapshotRef.current) {
      setCompletionRetryPhaseBOnly(false);
      setCompletionSubmitError(null);
    }
  }, [completionRetryPhaseBOnly, computePhaseAFingerprint]);

  const captureCompleteJobDraft = useCallback((): TechnicianCompleteJobDraft | null => {
    if (!selectedJobForComplete) return null;
    return {
      version: 1,
      jobId: selectedJobForComplete.id,
      savedAt: Date.now(),
      completeJobStep,
      completionNotes,
      billAmount,
      billPhotos,
      billPhotoSources,
      optionalCompletionPhotos,
      extraPhotosStep6,
      dontSendMessageToCustomer,
      amcDateGiven,
      amcEndDate,
      amcYears,
      amcIncludesPrefilter,
      amcAdditionalInfo,
      amcAmount,
      amcServicePeriodKind,
      amcServicePeriodCustomMonths,
      hasAMC,
      paymentMode,
      partialCashAmount,
      partialOnlineAmount,
      pendingPaidTodayEnabled,
      pendingPaidTodayMode,
      pendingPaidTodayAmount,
      promisedPaymentDate,
      customerHasPrefilter,
      rawWaterTds,
      qrCodeType,
      selectedQrCodeId,
      shareLinkUpiQrId,
      paymentScreenshot,
      otpInput,
      serviceBrand,
      selectedQrCodeName,
      selectedQrCodeUrl: selectedQrCodeUrlState,
      phaseASavedAt: phaseASavedAtRef.current,
      retryPhaseBOnly: completionRetryPhaseBOnly,
    };
  }, [
    selectedJobForComplete,
    completeJobStep,
    completionNotes,
    billAmount,
    billPhotos,
    billPhotoSources,
    optionalCompletionPhotos,
    extraPhotosStep6,
    dontSendMessageToCustomer,
    amcDateGiven,
    amcEndDate,
    amcYears,
    amcIncludesPrefilter,
    amcAdditionalInfo,
    amcAmount,
    amcServicePeriodKind,
    amcServicePeriodCustomMonths,
    hasAMC,
    paymentMode,
    partialCashAmount,
    partialOnlineAmount,
    pendingPaidTodayEnabled,
    pendingPaidTodayMode,
    pendingPaidTodayAmount,
    promisedPaymentDate,
    customerHasPrefilter,
    rawWaterTds,
    qrCodeType,
    selectedQrCodeId,
    shareLinkUpiQrId,
    paymentScreenshot,
    otpInput,
    serviceBrand,
    selectedQrCodeName,
    selectedQrCodeUrlState,
    completionRetryPhaseBOnly,
  ]);

  const applyCompleteJobDraft = useCallback((draft: TechnicianCompleteJobDraft) => {
    setCompleteJobStep(draft.completeJobStep);
    setCompletionNotes(draft.completionNotes);
    setBillAmount(draft.billAmount);
    setBillPhotos(draft.billPhotos);
    setBillPhotoSources(draft.billPhotoSources || {});
    setOptionalCompletionPhotos(draft.optionalCompletionPhotos);
    setExtraPhotosStep6(draft.extraPhotosStep6);
    setDontSendMessageToCustomer(draft.dontSendMessageToCustomer);
    setAmcDateGiven(draft.amcDateGiven);
    setAmcEndDate(draft.amcEndDate);
    setAmcYears(draft.amcYears);
    setAmcIncludesPrefilter(draft.amcIncludesPrefilter);
    setAmcAdditionalInfo(draft.amcAdditionalInfo);
    setAmcAmount(draft.amcAmount);
    if (draft.amcServicePeriodKind === '4') {
      setAmcServicePeriodKind('custom');
      setAmcServicePeriodCustomMonths(4);
    } else {
      setAmcServicePeriodKind(draft.amcServicePeriodKind);
      setAmcServicePeriodCustomMonths(draft.amcServicePeriodCustomMonths);
    }
    setHasAMC(draft.hasAMC);
    setPaymentMode(draft.paymentMode);
    setPartialCashAmount(draft.partialCashAmount);
    setPartialOnlineAmount(draft.partialOnlineAmount);
    setPendingPaidTodayEnabled(Boolean(draft.pendingPaidTodayEnabled));
    setPendingPaidTodayMode(draft.pendingPaidTodayMode || '');
    setPendingPaidTodayAmount(draft.pendingPaidTodayAmount || '');
    setPromisedPaymentDate(draft.promisedPaymentDate || '');
    setCustomerHasPrefilter(draft.customerHasPrefilter);
    setRawWaterTds(draft.rawWaterTds);
    setQrCodeType(draft.qrCodeType);
    setSelectedQrCodeId(draft.selectedQrCodeId);
    setShareLinkUpiQrId(draft.shareLinkUpiQrId || '');
    setSelectedQrCodeName(draft.selectedQrCodeName || '');
    setSelectedQrCodeUrlState(draft.selectedQrCodeUrl || '');
    setPaymentScreenshot(draft.paymentScreenshot);
    setOtpInput(draft.otpInput?.length === 4 ? draft.otpInput : ['', '', '', '']);
    setOtpError('');
    setServiceBrand(draft.serviceBrand);
    setCompletionSubmitError(null);

    // Restore Phase-A-saved / retry-only context (#3). If the previous run
    // already saved data to the server, we want the user to land on the
    // finish step and only re-attempt Phase B instead of redoing every step
    // (which would re-run Phase A and overwrite what's on the server).
    phaseASavedAtRef.current = draft.phaseASavedAt ?? null;
    if (draft.retryPhaseBOnly) {
      setCompletionRetryPhaseBOnly(true);
      setCompleteJobStep(6);
      setCompletionSubmitError(
        'Bill and photos already saved — tap Retry finish to mark this job completed.'
      );
    } else {
      setCompletionRetryPhaseBOnly(false);
    }
  }, []);

  useEffect(() => {
    if (!completeDialogOpen || !selectedJobForComplete || isSubmittingJobCompletion) return;
    const draft = captureCompleteJobDraft();
    if (draft) writeTechnicianCompleteJobDraft(draft);
  }, [completeDialogOpen, selectedJobForComplete, isSubmittingJobCompletion, captureCompleteJobDraft]);


  // Actually open the completion dialog
  const performCompleteJob = async (job: Job) => {
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

    // Same sync as Start Work: OTP may already be on the Ask OTP row / requirements
    // from notification, overlay, or card — don't force step 7 again.
    if (jobRequiresOtp(jobWithCustomer) && !getJobEnteredOtp(jobWithCustomer)) {
      try {
        const [{ data: fresh }, answered] = await Promise.all([
          supabase.from('jobs').select('requirements').eq('id', jobWithCustomer.id).maybeSingle(),
          getSubmittedOtpForJob(jobWithCustomer.id),
        ]);
        let reqs = parseJobRequirements(
          (fresh as { requirements?: unknown } | null)?.requirements ??
            (jobWithCustomer as any).requirements ??
            jobWithCustomer.requirements
        );
        const fromJob = getStoredOtpFromRequirements(reqs);
        const entered = fromJob || answered;
        if (entered) {
          if (!fromJob && answered) {
            reqs = applyOtpToRequirements(reqs, answered);
          }
          jobWithCustomer = { ...jobWithCustomer, requirements: reqs as any };
          setJobs((prev) =>
            prev.map((j) =>
              j.id === jobWithCustomer.id ? { ...j, requirements: reqs as any } : j
            )
          );
        }
      } catch {
        /* open with local job */
      }
    }
    
    setSelectedJobForComplete(jobWithCustomer);
    resetCompleteJobFormState();

    const savedDraft = readTechnicianCompleteJobDraft(jobWithCustomer.id);
    if (savedDraft) {
      // Defer opening the wizard until the user picks Resume / Start fresh.
      setCompleteJobDraftToResume(savedDraft);
      setResumeCompleteJobDraftOpen(true);
      return;
    }

    setCompleteJobDraftToResume(null);
    setResumeCompleteJobDraftOpen(false);
    await openCompleteJobWizardFresh(jobWithCustomer);
  };

  // Opens the wizard fresh with auto-prefills (customer's last brand, prefilter).
  // Raw water TDS is never prefilled — technician must enter it every visit.
  // Only called when there is no saved draft to resume.
  const openCompleteJobWizardFresh = async (jobWithCustomer: Job) => {
    const customerId =
      (jobWithCustomer.customer as any)?.id ||
      jobWithCustomer.customer?.id ||
      (jobWithCustomer as any)?.customer_id ||
      (jobWithCustomer as any)?.customerId ||
      jobWithCustomer.customer_id;

    // Photos nudge + optional upload step: only when THIS CUSTOMER has zero photos
    // altogether (profile + any past/current jobs) — not merely because this job slot is empty.
    if (customerId) {
      void (async () => {
        try {
          const allPhotos = await getAllCustomerPhotos(customerId);
          const customerHasNoPhotosAtAll = allPhotos.length === 0;
          setCustomerHasZeroPhotosAltogether(customerHasNoPhotosAtAll);
          if (!customerHasNoPhotosAtAll) return;

          const { data: custRow } = await supabase
            .from('customers')
            .select('id,photos,full_name')
            .eq('id', customerId)
            .maybeSingle();
          const merged = {
            ...((jobWithCustomer.customer as Record<string, unknown>) || {}),
            ...(custRow || {}),
          };
          const { nudgeTechCustomerProfileGaps } = await import('@/lib/nudgeTechCustomerProfile');
          nudgeTechCustomerProfileGaps({
            jobId: jobWithCustomer.id,
            customer: merged,
            phase: 'start',
            showToast: true,
            customerHasNoPhotosAtAll: true,
          });
        } catch {
          setCustomerHasZeroPhotosAltogether(false);
        }
      })();
    } else {
      setCustomerHasZeroPhotosAltogether(false);
    }

    if (customerId) {
      setIsLoadingServiceBrand(true);
      (async () => {
        try {
          const { data: brandByCustomer, error } = await db.jobs.getLastServiceBrandByCustomerIds([
            customerId,
          ]);

          setIsLoadingServiceBrand(false);
          if (error) {
            console.warn('[TechnicianDashboard] Failed to load last service brand:', error);
            setServiceBrand((prev) => prev ?? 'elevenro');
            return;
          }
          const normalized = normalizeServiceBrand(brandByCustomer?.[customerId]);
          if (normalized) {
            setLastServiceBrand(normalized);
            setServiceBrand(normalized);
          } else {
            // No previous brand on file (new customer / first service):
            // default the "Served As" selector to Eleven RO. Tech can still
            // toggle to Hydrogen RO before completing the job.
            setServiceBrand((prev) => prev ?? 'elevenro');
          }
        } catch (err) {
          console.warn('[TechnicianDashboard] Error loading last service brand:', err);
          setIsLoadingServiceBrand(false);
          setServiceBrand((prev) => prev ?? 'elevenro');
        }
      })();
    } else {
      // No customer id (defensive — first service or missing relation):
      // start the selector at Eleven RO.
      setServiceBrand((prev) => prev ?? 'elevenro');
    }

    const customerPrefilter = jobWithCustomer.customer
      ? ((jobWithCustomer.customer as any).has_prefilter ?? (jobWithCustomer.customer as any).hasPrefilter ?? null)
      : null;
    setCustomerHasPrefilter(customerPrefilter);

    setRawWaterTds('');

    setCompleteDialogOpen(true);
  };

  // Follow-up functionality handlers
  const handleScheduleFollowUp = (job: Job) => {
    setSelectedJobForFollowUp(job);
    setFollowUpModalOpen(true);
  };

  const handleFollowUpSubmit = async (jobId: string, followUpData: {
    followUpDate: string;
    followUpReason: string;
    parentFollowUpId?: string;
    rescheduleFollowUpId?: string;
    autoMoveToOngoingOnDate?: boolean;
  }) => {
    try {
      const existingJob = jobs.find((j) => j.id === jobId);
      const isRootFollowUp = !followUpData.parentFollowUpId;
      const requirements = isRootFollowUp
        ? applyAutoMoveToOngoingOnDateFlag(
            (existingJob as any)?.requirements,
            Boolean(followUpData.autoMoveToOngoingOnDate)
          )
        : (existingJob as any)?.requirements;

      // Update job status and follow-up info (root follow-ups only)
      if (isRootFollowUp) {
      // Use technician's user ID (UUID) - database expects UUID, not name
      const { error: jobError } = await db.jobs.update(jobId, {
        status: 'FOLLOW_UP',
        follow_up_date: followUpData.followUpDate,
        follow_up_notes: followUpData.followUpReason || '',
        follow_up_scheduled_by: user?.id || null,
        follow_up_scheduled_at: new Date().toISOString(),
        requirements,
      });

      if (jobError) {
        throw new Error(jobError.message);
      }
      }

      // Create or update follow-up record in follow_ups table
      if (followUpData.rescheduleFollowUpId) {
        // Reschedule existing follow-up
        const { error: rescheduleError } = await supabase
          .from('follow_ups')
          .update({
            scheduled_date: followUpData.followUpDate,
            reason: followUpData.followUpReason,
            updated_at: new Date().toISOString()
          })
          .eq('id', followUpData.rescheduleFollowUpId);

        if (rescheduleError) {
          console.error('Error rescheduling follow-up:', rescheduleError);
          // Continue even if follow_ups update fails
        }
      } else {
        // Create new follow-up record
        // Use technician's user ID (UUID) - database expects UUID, not name
        const { error: followUpError } = await supabase
          .from('follow_ups')
          .insert({
            job_id: jobId,
            scheduled_date: followUpData.followUpDate,
            reason: followUpData.followUpReason,
            parent_follow_up_id: followUpData.parentFollowUpId || null,
            scheduled_by: user?.id || null,
            completed: false
          });

        if (followUpError) {
          console.error('Error creating follow-up record:', followUpError);
          // Continue even if follow_ups insert fails
        }
      }

      // Update local state
      if (isRootFollowUp) {
      setJobs(prev => prev.map(job => 
        job.id === jobId 
          ? { 
              ...job, 
              status: 'FOLLOW_UP',
              followUpDate: followUpData.followUpDate,
              followUpNotes: followUpData.followUpReason || '',
              followUpScheduledBy: user?.id || 'technician',
              followUpScheduledAt: new Date().toISOString(),
              requirements,
            }
          : job
      ));
      }
      
      // Follow-up scheduled silently
      setFollowUpModalOpen(false);
      setSelectedJobForFollowUp(null);
    } catch (error) {
      console.error('Error scheduling follow-up:', error);
      toast.error('Failed to schedule follow-up');
    }
  };

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
    setMoveToOngoingTime(defaultTime);
    setMoveToOngoingTimeSlot(defaultTimeSlot);
    setMoveToOngoingCustomTime(defaultTimeSlot === 'CUSTOM' ? defaultTime : '');
    setSelectedJobForMoveToOngoing(job);
    setMoveToOngoingDialogOpen(true);
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
      
      const updateData: any = {
        status: 'ASSIGNED',
        scheduled_date: moveToOngoingDate, // Already in YYYY-MM-DD format from date input
        scheduled_time_slot: timeSlotToUse,
        assigned_date: assignedDateTime,
        // Clear follow-up related fields when moving to ongoing
        follow_up_date: null,
        follow_up_notes: null,
        follow_up_scheduled_by: null,
        follow_up_scheduled_at: null
      };

      // Only update requirements if we have custom time or if requirements exist
      if (requirements.length > 0) {
        updateData.requirements = requirements;
      }

      console.log('Updating job with data:', { 
        id: selectedJobForMoveToOngoing.id, 
        scheduled_date: moveToOngoingDate,
        scheduled_time_slot: timeSlotToUse,
        status: 'ASSIGNED'
      });

      const { error, data: updatedJob } = await db.jobs.update(selectedJobForMoveToOngoing.id, updateData);

      if (error) {
        console.error('Error updating job:', error);
        throw new Error(error.message);
      }

      console.log('Job updated successfully:', updatedJob);

      // Remove from seenJobs so it shows as a new job
      setSeenJobs(prev => {
        const newSet = new Set(prev);
        newSet.delete(selectedJobForMoveToOngoing.id);
        // Save to localStorage
        try {
          localStorage.setItem('technician_seen_jobs', JSON.stringify(Array.from(newSet)));
        } catch (error) {
          console.error('Error saving seen jobs to localStorage:', error);
        }
        return newSet;
      });

      // Close dialog and reset state first
      setMoveToOngoingDialogOpen(false);
      setSelectedJobForMoveToOngoing(null);
      setMoveToOngoingDate('');
      setMoveToOngoingTime('');
      setMoveToOngoingTimeSlot('MORNING');
      setMoveToOngoingCustomTime('');

      // Reload jobs to ensure everything is updated everywhere - this is critical
      // Wait a bit to ensure database update is complete
      await new Promise(resolve => setTimeout(resolve, 500));
      await loadAssignedJobs();

      toast.success('Job moved to ongoing with updated schedule');
    } catch (error) {
      console.error('Error moving job to ongoing:', error);
      toast.error('Failed to move job to ongoing');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDenyJob = (job: Job) => {
    setSelectedJobForDeny(job);
    setDenyDialogOpen(true);
  };

  const handleDenyJobSubmit = async () => {
    if (!selectedJobForDeny || !denyReason.trim()) {
      toast.error('Please provide a reason for denying the job');
      return;
    }

    try {
      // Get technician name for admin visibility
      const technicianName = user?.fullName || 'Unknown Technician';
      
      const { error } = await db.jobs.update(selectedJobForDeny.id, {
        status: 'DENIED',
        denial_reason: denyReason,
        denied_by: technicianName, // Store technician name instead of ID for admin visibility
        denied_at: new Date().toISOString()
      });

      if (error) {
        throw new Error(error.message);
      }

      // Update local state
      setJobs(prev => prev.map(job => 
        job.id === selectedJobForDeny.id 
          ? { 
              ...job, 
              status: 'DENIED',
              denialReason: denyReason,
              deniedBy: technicianName,
              deniedAt: new Date().toISOString()
            }
          : job
      ));
      
      // Job denied silently
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

  // Helper functions to determine step flow
  const isBillAmountZero = (): boolean => {
    if (billAmount === '') return true;
    const billAmountNum = parseMoneyAmount(billAmount);
    return !Number.isFinite(billAmountNum) || billAmountNum === 0;
  };

  const isSoftenerService = (): boolean => {
    if (!selectedJobForComplete) return false;
    const serviceType = (selectedJobForComplete.service_type || selectedJobForComplete.serviceType || '').toUpperCase();
    const serviceSubType = ((selectedJobForComplete as any).service_sub_type || selectedJobForComplete.serviceSubType || '').toUpperCase();
    return serviceType === 'SOFTENER' || 
           serviceSubType.includes('SOFTENER') || 
           serviceSubType.includes('SOFTNER') || // Handle typo variations
           serviceType.includes('SOFTENER');
  };

  // Check if job requires OTP verification
  const requiresOtp = (): boolean => {
    if (!selectedJobForComplete) return false;
    return parseJobRequirements(
      (selectedJobForComplete as any).requirements ?? selectedJobForComplete.requirements
    ).some((req: any) => req?.require_otp === true);
  };

  // Get OTP code from job requirements
  const getOtpCode = (): string | null => {
    if (!selectedJobForComplete) return null;
    const otpReq = parseJobRequirements(
      (selectedJobForComplete as any).requirements ?? selectedJobForComplete.requirements
    ).find((req: any) => req?.require_otp === true);
    return otpReq?.otp_code || null;
  };

  /** Job-level OTP check (any job, not just the one open in the complete dialog). */
  const jobRequiresOtp = (job: Job | null): boolean => {
    if (!job) return false;
    return parseJobRequirements((job as any).requirements ?? job.requirements).some(
      (req: any) => req?.require_otp === true
    );
  };

  /** OTP already captured on this job (at Start Work or via an office request). */
  const getJobEnteredOtp = (job: Job | null): string | null => {
    if (!job) return null;
    return getStoredOtpFromRequirements((job as any).requirements ?? job.requirements);
  };

  /** Completion wizard only shows the OTP step when the code wasn't captured at Start Work. */
  const needsOtpStep = (): boolean =>
    requiresOtp() && !getJobEnteredOtp(selectedJobForComplete);

  // Never park the wizard on step 7 when the OTP is already captured
  // (e.g. a draft saved before the code was entered at Start Work).
  useEffect(() => {
    if (completeJobStep === 7 && !needsOtpStep()) {
      setCompleteJobStep(6);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completeJobStep, selectedJobForComplete]);

  /** Remote URL / Cloudinary — local file placeholders fail this until upload finishes. */
  const isUploadedMediaUrl = (u: unknown): u is string =>
    typeof u === 'string' &&
    u.trim().length > 0 &&
    (u.startsWith('http://') || u.startsWith('https://') || u.includes('cloudinary.com'));

  /** Non-empty slot that is not a finished remote URL yet (background upload still in progress or failed). */
  const hasPendingLocalOrUploadingPhoto = (u: unknown) =>
    typeof u === 'string' && u.trim() !== '' && !isUploadedMediaUrl(u);

  const saveCompletedJobMissingPhotos = useCallback(async () => {
    if (!missingPhotoDialog || missingPhotoSaving) return;
    const uploaded = missingPhotoUrls.filter(isUploadedMediaUrl);
    if (uploaded.length === 0) {
      toast.error('Wait for the photo to finish uploading');
      return;
    }
    if (missingPhotoUrls.some(hasPendingLocalOrUploadingPhoto)) {
      toast.error('Wait for the photo to finish uploading');
      return;
    }
    setMissingPhotoSaving(true);
    try {
      const job = missingPhotoDialog.job;
      const merged = mergeCompletedJobMissingPhotos(job as any, {
        billPhotos: missingPhotoDialog.kind === 'bill' ? uploaded : undefined,
        billPhotoSources: missingPhotoDialog.kind === 'bill' ? missingPhotoSources : undefined,
        paymentScreenshots:
          missingPhotoDialog.kind === 'payment' ? uploaded : undefined,
      });
      const { error } = await db.jobs.update(job.id, {
        requirements: merged.requirements,
        after_photos: merged.after_photos,
      } as any);
      if (error) {
        toast.error(error.message || 'Could not save photo');
        return;
      }
      setJobs((prev) =>
        prev.map((j) =>
          j.id === job.id
            ? ({
                ...j,
                requirements: merged.requirements,
                after_photos: merged.after_photos,
              } as Job)
            : j
        )
      );
      toast.success(
        missingPhotoDialog.kind === 'bill'
          ? 'Bill photo saved'
          : 'Payment screenshot saved'
      );
      void import('@/lib/notifyAdminsJobEvent').then(({ notifyAdminsJobEvent }) =>
        notifyAdminsJobEvent(
          job.id,
          missingPhotoDialog.kind === 'bill'
            ? 'bill_photo_added'
            : 'payment_screenshot_added'
        )
      );
      setMissingPhotoDialog(null);
      setMissingPhotoUrls([]);
      setMissingPhotoSources({});
      setMissingPhotoUploading(false);
    } finally {
      setMissingPhotoSaving(false);
    }
    // isUploadedMediaUrl / hasPendingLocalOrUploadingPhoto are stable inline helpers in this render scope
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missingPhotoDialog, missingPhotoSaving, missingPhotoUrls, missingPhotoSources]);

  const hasPendingBillPhotosInState = () => billPhotos.some(hasPendingLocalOrUploadingPhoto);
  const hasPendingOptionalCompletionPhotos = () => optionalCompletionPhotos.some(hasPendingLocalOrUploadingPhoto);
  const hasPendingExtraStep6Photos = () => extraPhotosStep6.some(hasPendingLocalOrUploadingPhoto);
  const hasPendingPaymentScreenshotState = () =>
    typeof paymentScreenshot === 'string' &&
    paymentScreenshot.trim() !== '' &&
    !isUploadedMediaUrl(paymentScreenshot);

  /** Why completion is blocked, or null if every photo slot is idle and uploaded (or empty). */
  const getCompletionMediaNotReadyReason = (): string | null => {
    if (
      isBillPhotosUploading ||
      isPaymentScreenshotUploading ||
      isOptionalCompletionPhotosUploading ||
      isExtraPhotosStep6Uploading
    ) {
      return 'Photos are still uploading. Please wait before completing.';
    }
    if (hasPendingBillPhotosInState()) {
      return 'Bill photo(s) must finish uploading before you can complete the job.';
    }
    if (hasPendingOptionalCompletionPhotos()) {
      return 'Completion photo(s) must finish uploading before you can complete the job.';
    }
    if (hasPendingExtraStep6Photos()) {
      return 'Extra photo(s) must finish uploading before you can complete the job.';
    }
    if (hasPendingPaymentScreenshotState()) {
      return 'Payment screenshot must finish uploading before you can complete the job.';
    }
    return null;
  };

  const hasAnyPendingCompletionUploads = () => getCompletionMediaNotReadyReason() !== null;

  /** Primary button shows "Complete Job" — same steps that can trigger DB submit in one click. */
  const isCompleteJobFooterSubmit = () =>
    completeJobStep === 6 ||
    (completeJobStep === 3 && isBillAmountZero() && isSoftenerService() && !needsOtpStep()) ||
    (completeJobStep === 5 && isSoftenerService() && !needsOtpStep());

  /** Advance past step 2 with the bill photo URLs to persist (empty = skipped). */
  const advanceFromStep2 = (billPhotosForSave: string[]) => {
    if (!selectedJobForComplete) return;
    setBillPhotos(billPhotosForSave);

    const billIsZero = isBillAmountZero();
    const isSoftener = isSoftenerService();
    const shouldSkipAMC = billIsZero || isSoftener;

    const needsOtp = needsOtpStep();
    let nextStep: 3 | 4 | 6 | 7 = 3;
    if (shouldSkipAMC) {
      if (billIsZero) {
        nextStep = needsOtp ? 7 : 6;
      } else {
        nextStep = 4;
      }
    }

    if (shouldSkipAMC && billIsZero && isSoftener) {
      setHasAMC(false);
      setCustomerHasPrefilter(null);
      setRawWaterTds('');
      if (needsOtp) {
        setCompleteJobStep(7);
      } else {
        setCompleteJobStep(6);
      }
      return;
    }
    setCompleteJobStep(nextStep);
  };

  const afterJobCompletionSaved = useCallback(
    async (uploadedBillPhotos: string[]) => {
      if (!selectedJobForComplete) return;
      const jobId = selectedJobForComplete.id;
      clearTechnicianCompleteJobDraft(jobId);
      setCompletionRetryPhaseBOnly(false);
      setCompletionSubmitError(null);

      // Tell the office phones the job is done (HRO Admin app push).
      void import('@/lib/notifyAdminsJobEvent').then(({ notifyAdminsJobEvent }) =>
        notifyAdminsJobEvent(jobId, 'completed')
      );

      if (askForReview && user?.id) {
        void import('@/lib/jobReviews').then(({ createJobReviewInvite }) => {
          void createJobReviewInvite({
            jobId,
            technicianId: String(user.id),
          });
        });
      }

      // Brand completion WhatsApp (Settings → auto-send). Soft-fail; skips AMC / dont_send.
      void (async () => {
        try {
          const { queueJobCompletionWhatsAppAutoSend } = await import(
            '@/lib/jobCompletionWhatsApp'
          );
          let jobForWa: Record<string, unknown> = {
            ...(selectedJobForComplete as Record<string, unknown>),
            id: jobId,
            status: 'COMPLETED',
            actual_cost: Number.isFinite(parseMoneyAmount(billAmount))
              ? parseMoneyAmount(billAmount)
              : 0,
            payment_amount: Number.isFinite(parseMoneyAmount(billAmount))
              ? parseMoneyAmount(billAmount)
              : 0,
            service_brand:
              serviceBrand ||
              (selectedJobForComplete as any).service_brand ||
              (selectedJobForComplete as any).serviceBrand,
          };
          if (dontSendMessageToCustomer || !askForReview) {
            const prev = Array.isArray((jobForWa as any).requirements)
              ? ([...(jobForWa as any).requirements] as unknown[])
              : [];
            const extra: unknown[] = [];
            if (dontSendMessageToCustomer) extra.push({ dont_send_message: true });
            if (!askForReview) extra.push({ skip_review: true });
            jobForWa = { ...jobForWa, requirements: [...prev, ...extra] };
          }
          try {
            const { data: fresh } = await db.jobs.getById(jobId);
            if (fresh) {
              jobForWa = {
                ...(fresh as Record<string, unknown>),
                customer: (fresh as any).customer || selectedJobForComplete.customer,
              };
            }
          } catch {
            /* use local snap */
          }
          queueJobCompletionWhatsAppAutoSend(jobForWa);
        } catch {
          /* never block completion */
        }
      })();

      // If customer still has no photos at finish, nudge again (even if they ignored at start).
      const endCustomerId =
        (selectedJobForComplete.customer as any)?.id ||
        selectedJobForComplete.customer?.id ||
        selectedJobForComplete.customer_id ||
        (selectedJobForComplete as any).customer_id ||
        selectedJobForComplete.customerId;
      if (endCustomerId) {
        void (async () => {
          try {
            const allPhotos = await getAllCustomerPhotos(endCustomerId);
            if (allPhotos.length > 0) {
              setCustomerHasZeroPhotosAltogether(false);
              return;
            }
            setCustomerHasZeroPhotosAltogether(true);
            const { data: custRow } = await supabase
              .from('customers')
              .select('id,photos,full_name')
              .eq('id', endCustomerId)
              .maybeSingle();
            const { nudgeTechCustomerProfileGaps } = await import('@/lib/nudgeTechCustomerProfile');
            nudgeTechCustomerProfileGaps({
              jobId,
              customer: custRow || (selectedJobForComplete.customer as Record<string, unknown>),
              phase: 'end',
              showToast: true,
              customerHasNoPhotosAtAll: true,
            });
          } catch {
            /* best-effort */
          }
        })();
      }

      const totalPhotosCount =
        uploadedBillPhotos.length +
        (paymentScreenshot && paymentScreenshot.startsWith('http') ? 1 : 0);
      if (totalPhotosCount > 0) {
        toast.success(`Job completed successfully with ${totalPhotosCount} photo(s)!`, {
          duration: 3000,
        });
      } else {
        toast.success('Job completed successfully!', { duration: 3000 });
      }

      // Photos whose upload failed live in the offline queue and attach to the
      // job in the background — tell the tech so a "missing" photo isn't a surprise,
      // and kick a retry tick right away.
      try {
        const pendingForJob = getQueuedPhotos().filter((p) => p.jobId === jobId);
        if (pendingForJob.length > 0) {
          toast.info(
            `${pendingForJob.length} photo(s) are still uploading in the background and will be added to this job automatically. Keep the app open with internet on.`,
            { duration: 8000 }
          );
          void processQueuedPhotos();
        }
      } catch {
        /* best-effort */
      }

      const customerId =
        (selectedJobForComplete.customer as any)?.id ||
        selectedJobForComplete.customer?.id ||
        selectedJobForComplete.customer_id ||
        (selectedJobForComplete as any).customer_id ||
        selectedJobForComplete.customerId;

      if (customerId) {
        try {
          const updatePayload: Record<string, any> = {
            last_service_date: new Date().toISOString().split('T')[0],
          };
          if (!isSoftenerService()) {
            if (customerHasPrefilter !== null) updatePayload.has_prefilter = customerHasPrefilter;
            const tdsVal = parseInt(rawWaterTds, 10);
            if (!isNaN(tdsVal) && tdsVal >= 0) {
              updatePayload.raw_water_tds = tdsVal;
            } else if (rawWaterTds === '') {
              updatePayload.raw_water_tds = 0;
            }
          }
          if (Object.keys(updatePayload).length > 0) {
            const { error } = await db.customers.update(customerId, updatePayload);
            if (error) {
              toast.error(`Failed to update customer: ${error.message || 'Unknown error'}`);
            }
          }
        } catch (error: any) {
          toast.error(`Failed to update customer: ${error?.message || 'Unknown error'}`);
        }
      }

      shouldPreserveOrderRef.current = true;
      setJobs((prev) =>
        prev.map((job) =>
          job.id === jobId
            ? {
                ...job,
                status: 'COMPLETED',
                end_time: new Date().toISOString(),
                completionNotes: completionNotes.trim(),
                completedBy: user?.id || user?.technicianId || null,
                completedAt: new Date().toISOString(),
                actual_cost: Number.isFinite(parseMoneyAmount(billAmount))
                  ? parseMoneyAmount(billAmount)
                  : 0,
                payment_amount: Number.isFinite(parseMoneyAmount(billAmount))
                  ? parseMoneyAmount(billAmount)
                  : 0,
                customer: job.customer,
              }
            : job
        )
      );

      const completedCustId =
        (selectedJobForComplete.customer as any)?.id ||
        selectedJobForComplete.customer_id ||
        (selectedJobForComplete as any).customer_id;
      if (completedCustId) {
        setCustomerPriorServiceStatus((prev) => ({ ...prev, [completedCustId]: true }));
      }

      setIsSubmittingJobCompletion(false);
      setCompleteDialogOpen(false);
      setSelectedJobForComplete(null);
      resetCompleteJobFormState();
    },
    [
      selectedJobForComplete,
      paymentScreenshot,
      billAmount,
      serviceBrand,
      dontSendMessageToCustomer,
      completionNotes,
      customerHasPrefilter,
      rawWaterTds,
      user,
      askForReview,
      resetCompleteJobFormState,
    ]
  );

  const handleCompleteJobSubmit = async () => {
    if (!selectedJobForComplete) return;
    if (isSubmittingJobCompletion) return;

    // In retry mode, step gates are bypassed below and the submit block runs unconditionally.
    // We only nudge the visual step indicator to step 6 so the header copy stays consistent.
    if (completionRetryPhaseBOnly && completeJobStep !== 6) {
      setCompleteJobStep(6);
    }

    // Step 1: Bill Amount - validate and show confirmation
    if (!completionRetryPhaseBOnly && completeJobStep === 1) {
      if (!serviceBrand) {
        toast.error('Please select service brand');
        return;
      }
      const billAmountNum = parseMoneyAmount(billAmount);
      if (!billAmount.trim() || !Number.isFinite(billAmountNum)) {
        toast.error('Please enter a valid bill amount');
        return;
      }
      if (customerHasZeroPhotosAltogether && (isOptionalCompletionPhotosUploading || hasPendingOptionalCompletionPhotos())) {
        toast.error(
          isOptionalCompletionPhotosUploading
            ? 'Completion photo(s) are still uploading.'
            : 'Completion photo(s) must finish uploading first.',
          TOAST_VALIDATION
        );
        return;
      }
      // Show confirmation dialog
      setBillAmountConfirmOpen(true);
      return;
    }

    // Step 2: Bill photos optional — no skip dialog while uploads run (Next/Skip disabled until done)
    if (!completionRetryPhaseBOnly && completeJobStep === 2) {
      if (isBillPhotosUploading || hasPendingBillPhotosInState()) {
        toast.error(
          isBillPhotosUploading
            ? 'Bill photo(s) are still uploading.'
            : 'Bill photo(s) must finish uploading before continuing.',
          TOAST_VALIDATION
        );
        return;
      }
      const hasAnyBillSlot = billPhotos.some((u) => typeof u === 'string' && u.trim() !== '');
      if (hasAnyBillSlot) {
        advanceFromStep2([...billPhotos]);
      } else {
        setBillPhotosSkipConfirmOpen(true);
      }
      return;
    }

    // Step 3: AMC Information (optional, can skip) - move to next step
    if (!completionRetryPhaseBOnly && completeJobStep === 3) {
      // Skip AMC step if bill is zero or service is softener (shouldn't reach here, but safety check)
      const billIsZeroStep3 = isBillAmountZero();
      const isSoftenerStep3 = isSoftenerService();
      if (billIsZeroStep3 || isSoftenerStep3) {
        // Auto-skip AMC and proceed
        setHasAMC(false);
        const nextStep = billIsZeroStep3 ? 6 : 4;
        if (billIsZeroStep3 && isSoftenerStep3) {
          setCustomerHasPrefilter(null);
        setRawWaterTds('');
          setCompleteJobStep(6);
          // Continue to submit logic
        } else {
          setCompleteJobStep(nextStep);
          return;
        }
      }
      
      // Only allow proceeding if hasAMC is not null (question has been answered)
      if (hasAMC === null) {
        toast.error('Please answer whether the customer needs AMC or not');
        return;
      }

      // #7 If the technician picked "Yes, customer has AMC", we MUST collect
      // valid AMC details. The previous code silently treated `years = 0` as
      // "no AMC" and dropped the entire AMC block at submit time — so the
      // tech thought AMC was recorded and admin saw nothing. Block the step
      // until the contradiction is resolved.
      if (hasAMC === true) {
        if (!amcDateGiven || !amcDateGiven.trim()) {
          toast.error('Please select AMC start date');
          return;
        }
        if (!amcYears || amcYears < 1) {
          toast.error(
            'You selected "Yes, customer has AMC" — please choose number of years (1, 2, or 3), or change the answer to No.'
          );
          return;
        }
        const amountTrimmed = amcAmount?.trim() ?? '';
        if (!amountTrimmed) {
          toast.error('Please enter AMC amount');
          return;
        }
        const amountNum = parseFloat(amountTrimmed);
        if (isNaN(amountNum) || amountNum < 0) {
          toast.error('Please enter a valid AMC amount');
          return;
        }
        if (amcIncludesPrefilter === null) {
          toast.error('Please select whether AMC includes prefilter (Yes or No)');
          return;
        }
        if (!amcServicePeriodKind) {
          toast.error('Please select AMC service period (auto job creation)');
          return;
        }
        if (amcServicePeriodKind === 'custom' && (amcServicePeriodCustomMonths < 1 || amcServicePeriodCustomMonths > 24)) {
          toast.error('Please enter a valid custom period (1–24 months)');
          return;
        }
      }
      
      // Check if bill amount is zero - if so, skip payment steps (4 and 5)
      const billIsZeroStep3Continue = isBillAmountZero();
      const needsOtp = needsOtpStep();
      
      // Determine next step:
      // - If bill is zero: skip to step 7 (OTP) if required, or step 6 (prefilter) or submit if softener
      // - If bill is not zero: go to step 4 (payment mode)
      let nextStep: 4 | 6 | 7 = 4;
      const billIsZeroStep3Final = billIsZeroStep3Continue;
      if (billIsZeroStep3Final) {
        // Skip payment steps, check if OTP is required
        nextStep = needsOtp ? 7 : 6;
      }
      
      // If bill is zero and service is softener, check OTP first
      if (billIsZeroStep3Final && isSoftenerService()) {
        // Set customerHasPrefilter to null (not applicable for softener)
        setCustomerHasPrefilter(null);
        setRawWaterTds('');
        if (needsOtp) {
          setCompleteJobStep(7);
          return;
        } else {
          // Set step to 6 to trigger submit logic, but skip step 6 UI
          setCompleteJobStep(6);
          // Continue to submit logic - don't return here
        }
      } else {
        setCompleteJobStep(nextStep);
        return;
      }
    }

    // Step 4: Payment Mode - validate and move to step 5
    if (!completionRetryPhaseBOnly && completeJobStep === 4) {
      // Skip payment step if bill amount is zero (shouldn't reach here, but safety check)
      if (isBillAmountZero()) {
        // Skip to step 7 (OTP) if required, or step 6 (prefilter) or submit if softener
        const isSoftener = isSoftenerService();
        const needsOtp = needsOtpStep();
        if (needsOtp) {
          setCompleteJobStep(7);
          return;
        }
        if (isSoftener) {
          setCustomerHasPrefilter(null);
        setRawWaterTds('');
          setCompleteJobStep(6);
          // Continue to submit logic
        } else {
          setCompleteJobStep(6);
          return;
        }
      }
      
      // Validate payment mode only if bill amount is not zero
      if (!paymentMode) {
        toast.error('Please select a payment mode');
        return;
      }
      if (paymentMode === 'ONLINE') {
        if (!resolveEffectiveQrCodeId(selectedQrCodeId, shareLinkUpiQrId)) {
          toast.error(
            selectedQrCodeId === SHARE_QR_LINK_VALUE
              ? 'Select which UPI to use for the share link'
              : 'Please select a QR code'
          );
          return;
        }
      }
      if (paymentMode === 'PARTIAL') {
        const bill = parseMoneyAmount(billAmount);
        const cash = parseMoneyAmount(partialCashAmount);
        const online = parseMoneyAmount(partialOnlineAmount);
        if (Number.isFinite(bill) && bill > 0) {
          const sum = (Number.isFinite(cash) ? cash : 0) + (Number.isFinite(online) ? online : 0);
          if (Math.abs(sum - bill) > 0.01) {
            toast.error('Cash + Online must equal the bill amount');
            return;
          }
        }
        if (Number.isFinite(online) && online > 0) {
          if (!resolveEffectiveQrCodeId(selectedQrCodeId, shareLinkUpiQrId)) {
            toast.error(
              selectedQrCodeId === SHARE_QR_LINK_VALUE
                ? 'Select which UPI to use for the share link'
                : 'Please select a QR code for the online part'
            );
            return;
          }
        }
      }
      if (paymentMode === 'PENDING_PAYMENT') {
        const bill = parseMoneyAmount(billAmount);
        const paidToday =
          pendingPaidTodayEnabled && pendingPaidTodayMode === 'PARTIAL'
            ? (parseMoneyAmount(partialCashAmount) || 0) + (parseMoneyAmount(partialOnlineAmount) || 0)
            : pendingPaidTodayEnabled
              ? parseMoneyAmount(pendingPaidTodayAmount) || 0
              : 0;
        const err = validatePendingPaymentInputs({
          billAmount: bill,
          paidTodayEnabled: pendingPaidTodayEnabled,
          paidTodayMode: pendingPaidTodayMode,
          paidTodayAmount: paidToday,
          partialCash: parseMoneyAmount(partialCashAmount) || 0,
          partialOnline: parseMoneyAmount(partialOnlineAmount) || 0,
          promisedDate: promisedPaymentDate,
        });
        if (err) {
          toast.error(err);
          return;
        }
        const needsQr =
          pendingPaidTodayEnabled &&
          (pendingPaidTodayMode === 'ONLINE' ||
            (pendingPaidTodayMode === 'PARTIAL' && parseMoneyAmount(partialOnlineAmount) > 0));
        if (needsQr && !resolveEffectiveQrCodeId(selectedQrCodeId, shareLinkUpiQrId)) {
          toast.error(
            selectedQrCodeId === SHARE_QR_LINK_VALUE
              ? 'Select which UPI to use for the share link'
              : 'Please select a QR code for today’s online payment'
          );
          return;
        }
      }
      // Move to step 5 (Payment Screenshot)
      setCompleteJobStep(5);
        return;
    }

    // Step 5: Payment screenshot (optional) — uploads still validated at submit if present
    if (!completionRetryPhaseBOnly && completeJobStep === 5) {
      if (!isBillAmountZero() && (isPaymentScreenshotUploading || hasPendingPaymentScreenshotState())) {
        toast.error(
          isPaymentScreenshotUploading
            ? 'Payment screenshot is still uploading.'
            : 'Payment screenshot must finish uploading before continuing.',
          TOAST_VALIDATION
        );
        return;
      }
      // Check if OTP is required
      const needsOtp = needsOtpStep();
      
      if (needsOtp) {
        // Go to OTP step (step 7)
        setCompleteJobStep(7);
        return;
      }
      
      // If service is softener, skip prefilter step and submit directly
      if (isSoftenerService()) {
        // Set customerHasPrefilter to null (not applicable for softener)
        setCustomerHasPrefilter(null);
        setRawWaterTds('');
        // Set step to 6 to trigger submit logic, but skip step 6 UI
        setCompleteJobStep(6);
        // Continue to submit logic - don't return here
      } else {
        setCompleteJobStep(6);
        return;
      }
    }

    // Step 7: OTP Verification (if required)
    if (!completionRetryPhaseBOnly && completeJobStep === 7) {
      // Validate OTP - check all 4 boxes are filled
      const otpValue = otpInput.join('');
      if (otpValue.length !== 4) {
        setOtpError('Please enter all 4 digits');
        return;
      }
      
      // OTP entered (any 4 digits), proceed to prefilter step (step 6) or submit if softener
      setOtpError('');
      
      if (isSoftenerService()) {
        // Set customerHasPrefilter to null (not applicable for softener)
        setCustomerHasPrefilter(null);
        setRawWaterTds('');
        setCompleteJobStep(6);
        // Continue to submit logic
      } else {
        setCompleteJobStep(6);
        return;
      }
    }

    // Step 6: Prefilter - submit the form (or submit directly if softener service skipped this step)
    if (completeJobStep === 6 || completionRetryPhaseBOnly) {
      // If softener service, customerHasPrefilter should be null (not applicable)
      if (isSoftenerService()) {
        setCustomerHasPrefilter(null);
        setRawWaterTds('');
      } else {
        // Raw water TDS is required for RO jobs
        if (!rawWaterTds.trim()) {
          toast.error('Please enter Raw water TDS (ppm)');
          return;
        }
      }

      // Determine payment mode - if bill is zero, payment mode should be empty
      const finalPaymentMode = isBillAmountZero() ? '' : (paymentMode as 'CASH' | 'ONLINE' | '');
      const finalPaymentScreenshot = isBillAmountZero() ? '' : paymentScreenshot;
      const finalQrCodeType = isBillAmountZero() ? '' : qrCodeType;
      const finalSelectedQrCodeId = isBillAmountZero()
        ? ''
        : resolveEffectiveQrCodeId(selectedQrCodeId, shareLinkUpiQrId);
      
      // Submit path below requires all bill/payment/optional/step-6 photos to be real URLs
    }
    
    const mediaNotReady = getCompletionMediaNotReadyReason();
    if (mediaNotReady) {
      toast.error(mediaNotReady, TOAST_VALIDATION);
      return;
    }

    setIsSubmittingJobCompletion(true);
    setCompletionSubmitError(null);
    
    try {
      const jobId = selectedJobForComplete.id;

      if (completionRetryPhaseBOnly) {
        const { data: latestForRetry, error: fetchRetryErr } = await db.jobs.getByIdFull(jobId);
        if (fetchRetryErr) {
          console.warn('Could not fetch job before retry finalize:', fetchRetryErr);
        }

        // #2 Idempotency: if a previous retry actually reached the server but
        // the response was lost, the job is already COMPLETED. Don't run
        // another UPDATE — that would overwrite completed_at / completed_by
        // with fresh values and leave the audit trail wrong. Just unblock
        // the UI as if this attempt succeeded.
        const latestStatus = ((latestForRetry as any)?.status || '').toString().toUpperCase();
        if (latestStatus === 'COMPLETED') {
          console.log('[completeJob] Phase B retry: job already COMPLETED on server, skipping update');
          await afterJobCompletionSaved(billPhotos.filter(isUploadedMediaUrl));
          return;
        }

        const reqsForRetry = stripCompletionDraftMarkers(
          parseJobRequirementsArray(latestForRetry?.requirements)
        );
        const phaseBRetry = {
          status: 'COMPLETED' as const,
          end_time: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          completed_by: user?.id || user?.technicianId || null,
          requirements: JSON.stringify(reqsForRetry),
        };
        const { error: retryErr } = await withTimeout(
          db.jobs.update(jobId, phaseBRetry),
          30000,
          'Finalizing job completion is taking longer than expected'
        );
        if (retryErr) {
          const friendly = friendlyCompletionErrorMessage(retryErr);
          setCompletionSubmitError(`${friendly} Tap Retry finish to try again.`);
          setIsSubmittingJobCompletion(false);
          return;
        }
        await afterJobCompletionSaved(billPhotos.filter(isUploadedMediaUrl));
        return;
      }

      // STEP 1: Bill photos — gated by getCompletionMediaNotReadyReason(); only remote URLs here
      const uploadedBillPhotos = billPhotos.filter(isUploadedMediaUrl);
      
      // STEP 2: Get QR code details
      // Note: QR codes are NOT uploaded to Cloudinary - we use the existing URL directly
      // QR codes are already stored in the database (common_qr_codes table) or technician profiles
      // If the QR code URL is already a Cloudinary URL, we use it as-is without uploading
      // Resolve QR code details with multiple fallbacks (handles draft restore + visibility filtering)
      const effectiveQrId = resolveEffectiveQrCodeId(selectedQrCodeId, shareLinkUpiQrId);
      let selectedQrCodeUrl: string | undefined = selectedQrCodeUrlState || undefined;
      let selectedQrCodeNameLocal: string | undefined = selectedQrCodeName || undefined;

      if (effectiveQrId && effectiveQrId.startsWith('common_')) {
        const qrId = effectiveQrId.replace('common_', '');
        const selectedQr =
          commonQrCodes.find(qr => qr.id === qrId) ||
          allCommonQrCodes.find(qr => qr.id === qrId) ||
          commonQrCodesForTechnician.find(qr => qr.id === qrId);
        if (selectedQr) {
          selectedQrCodeUrl = selectedQr.qrCodeUrl || selectedQrCodeUrl;
          selectedQrCodeNameLocal = selectedQr.name || selectedQrCodeNameLocal;
        }
      } else if (effectiveQrId && effectiveQrId.startsWith('technician_')) {
        const techId = effectiveQrId.replace('technician_', '');
        const selectedTech =
          technicians.find(t => t.id === techId) ||
          allTechnicians.find(t => t.id === techId);
        if (selectedTech && (selectedTech as any).qrCode) {
          selectedQrCodeUrl = (selectedTech as any).qrCode || selectedQrCodeUrl;
          selectedQrCodeNameLocal = (selectedTech as any).fullName || selectedQrCodeNameLocal || 'Technician';
        }
      }

      // STEP 3: Submit directly to database
      try {
        // Prepare update data
        let dbPaymentMethod: 'CASH' | 'CARD' | 'UPI' | 'BANK_TRANSFER' | 'PARTIAL' | null = null;
        const parsedBill = parseMoneyAmount(billAmount);
        let paymentAmount = Number.isFinite(parsedBill) ? parsedBill : 0;
        let paidTodayForPending = 0;
        if (!isBillAmountZero()) {
          if (paymentMode === 'CASH') {
            dbPaymentMethod = 'CASH';
          } else if (paymentMode === 'ONLINE') {
            dbPaymentMethod = 'UPI';
          } else if (paymentMode === 'PARTIAL') {
            dbPaymentMethod = 'PARTIAL';
            const cash = parseMoneyAmount(partialCashAmount);
            const online = parseMoneyAmount(partialOnlineAmount);
            paymentAmount =
              (Number.isFinite(cash) ? cash : 0) + (Number.isFinite(online) ? online : 0);
          } else if (paymentMode === 'PENDING_PAYMENT') {
            paidTodayForPending =
              pendingPaidTodayEnabled && pendingPaidTodayMode === 'PARTIAL'
                ? (parseMoneyAmount(partialCashAmount) || 0) + (parseMoneyAmount(partialOnlineAmount) || 0)
                : pendingPaidTodayEnabled
                  ? parseMoneyAmount(pendingPaidTodayAmount) || 0
                  : 0;
            dbPaymentMethod = resolveDbPaymentMethodFromUi(
              'PENDING_PAYMENT',
              pendingPaidTodayMode || null,
              paidTodayForPending
            );
            // Full bill for commission trigger / salary
            paymentAmount = Number.isFinite(parsedBill) ? parsedBill : 0;
          }
        }
        
        const updateData: any = {
          status: 'COMPLETED',
          end_time: new Date().toISOString(),
          completion_notes: completionNotes.trim(),
          completed_by: user?.id || user?.technicianId || null,
          completed_at: new Date().toISOString(),
          service_brand: serviceBrand,
          actual_cost: Number.isFinite(parsedBill) ? parsedBill : 0,
          payment_amount: paymentAmount,
          payment_method: dbPaymentMethod || (isBillAmountZero() ? null : paymentMode === 'PENDING_PAYMENT' ? null : 'CASH'),
          payment_status: resolveJobCustomerPaymentStatus({
            billAmount: Number.isFinite(parsedBill) ? parsedBill : 0,
            mode: (paymentMode || '') as any,
            paidTodayAmount: paidTodayForPending,
          }),
        };

        // Fetch latest job data to ensure we have the most up-to-date requirements
        const { data: latestJobData, error: fetchError } = await db.jobs.getByIdFull(selectedJobForComplete.id);
        if (fetchError) {
          console.warn('⚠️ Could not fetch latest job data, using cached data:', fetchError);
        }
        
        // Handle requirements - use latest job data if available, otherwise use cached
        const jobRequirements = latestJobData?.requirements || selectedJobForComplete.requirements || [];
        let requirements: any[] = [];
        
        if (Array.isArray(jobRequirements)) {
          requirements = [...jobRequirements];
        } else if (typeof jobRequirements === 'string') {
          try {
            requirements = JSON.parse(jobRequirements);
            if (!Array.isArray(requirements)) {
              requirements = [];
            }
          } catch {
            requirements = [];
          }
        }

        // Update OTP verification status if OTP was entered (any 4 digits)
        const otpValue = otpInput.join('');
        if (requiresOtp() && otpValue && otpValue.length === 4) {
          const otpReq = requirements.find((req: any) => req?.require_otp === true);
          if (otpReq) {
            otpReq.otp_verified = true;
            otpReq.otp_verified_at = new Date().toISOString();
            otpReq.otp_entered = otpValue; // Store the entered OTP for manual verification
          }
          // Clear home Ask OTP card if office still had a pending request.
          void markOtpRequestAnsweredForJob(selectedJobForComplete.id, otpValue);
        }

        // Remove existing photo-related requirements to avoid duplicates
        // Strip any prior completion-time entries so retries don't accumulate duplicates in jobs.requirements.
        requirements = requirements.filter((req: any) => {
          if (!req || typeof req !== 'object') return true;
          if (req.bill_photos !== undefined) return false;
          if (req.payment_photos !== undefined) return false;
          if (req.qr_photos !== undefined) return false;
          if (req.completion_draft !== undefined) return false;
          if (req.amc_info !== undefined) return false;
          if (req.dont_send_message !== undefined) return false;
          if (req.partial_cash_amount !== undefined || req.partial_online_amount !== undefined) return false;
          if (req.pending_payment !== undefined) return false;
          return true;
        });

        // Add bill photos (all should be uploaded Cloudinary URLs at this point)
        if (uploadedBillPhotos.length > 0) {
          requirements.push(billPhotosRequirement(uploadedBillPhotos, billPhotoSources));
          console.log('✅ Added bill photos to requirements:', uploadedBillPhotos);
        }

        // Collect all photos for after_photos array (bill photos + payment screenshot)
        const allAfterPhotos: string[] = [...uploadedBillPhotos];
        
        // Check if payment screenshot is uploaded (handle both primary and secondary Cloudinary accounts)
        // Also handle PWA apps where URLs might be formatted differently
        const isPaymentScreenshotUploaded = paymentScreenshot && typeof paymentScreenshot === 'string' && (
          paymentScreenshot.startsWith('http://') || 
          paymentScreenshot.startsWith('https://') ||
          paymentScreenshot.includes('cloudinary.com') || // Cloudinary URLs
          paymentScreenshot.includes('res.cloudinary.com') // Full Cloudinary URLs
        );
        
        // Check if running in PWA mode
        const isPWA = window.matchMedia('(display-mode: standalone)').matches || 
                     (window.navigator as any).standalone === true ||
                     document.referrer.includes('android-app://');
        
        console.log('📸 Payment screenshot check:', {
          paymentScreenshot,
          isUploaded: isPaymentScreenshotUploaded,
          paymentMode,
          isPWA,
          screenshotLength: paymentScreenshot?.length || 0
        });
        
        // Always add payment screenshot to after_photos if uploaded (regardless of payment mode)
        // This ensures payment screenshots are always saved and displayed
        if (isPaymentScreenshotUploaded) {
          // Check if payment screenshot is already in allAfterPhotos (avoid duplicates)
          const isAlreadyIncluded = allAfterPhotos.some(url => {
            if (!url || !paymentScreenshot) return false;
            // Normalize URLs for comparison (remove query params, fragments)
            const normalizedUrl1 = url.split('?')[0].split('#')[0].trim().toLowerCase();
            const normalizedUrl2 = paymentScreenshot.split('?')[0].split('#')[0].trim().toLowerCase();
            return normalizedUrl1 === normalizedUrl2;
          });
          
          if (!isAlreadyIncluded) {
            allAfterPhotos.push(paymentScreenshot);
            console.log('✅ Added payment screenshot to after_photos:', paymentScreenshot);
          } else {
            console.log('ℹ️ Payment screenshot already in after_photos, skipping duplicate');
          }
          console.log('✅ Total photos in after_photos:', allAfterPhotos.length, allAfterPhotos);
        } else {
          console.warn('⚠️ Payment screenshot not uploaded or invalid:', paymentScreenshot);
          // In PWA mode, if payment screenshot exists but validation failed, log more details
          if (isPWA && paymentScreenshot) {
            console.warn('⚠️ PWA mode: Payment screenshot exists but failed validation:', {
              value: paymentScreenshot,
              type: typeof paymentScreenshot,
              startsWithHttp: paymentScreenshot.startsWith('http'),
              includesCloudinary: paymentScreenshot.includes('cloudinary')
            });
          }
        }

        // Step 6 "extra" completion photos → after_photos so admin reports / completed cards see them (also merged into job.images below).
        for (const url of extraPhotosStep6.filter(isUploadedMediaUrl)) {
          const n2 = url.split('?')[0].split('#')[0].trim().toLowerCase();
          const dup = allAfterPhotos.some((u) =>
            (u || '').split('?')[0].split('#')[0].trim().toLowerCase() === n2
          );
          if (!dup) allAfterPhotos.push(url);
        }
        
        // Add qr_photos to requirements for ONLINE and PARTIAL (online part) payments
        const pendingNeedsQr =
          paymentMode === 'PENDING_PAYMENT' &&
          pendingPaidTodayEnabled &&
          (pendingPaidTodayMode === 'ONLINE' ||
            (pendingPaidTodayMode === 'PARTIAL' && parseMoneyAmount(partialOnlineAmount) > 0));
        if (
          paymentMode === 'ONLINE' ||
          (paymentMode === 'PARTIAL' && effectiveQrId) ||
          (pendingNeedsQr && effectiveQrId)
        ) {
          if (selectedQrCodeUrl && !(
            selectedQrCodeUrl.includes('cloudinary.com') || 
            selectedQrCodeUrl.includes('res.cloudinary.com') ||
            selectedQrCodeUrl.startsWith('http://') || 
            selectedQrCodeUrl.startsWith('https://')
          )) {
            console.warn('⚠️ QR code URL is not a valid URL format:', selectedQrCodeUrl);
          }
          const qrPhotos: any = {
            qr_code_type:
              selectedQrCodeId === SHARE_QR_LINK_VALUE ? 'share_link' : qrCodeType,
            selected_qr_code_id: effectiveQrId,
            payment_screenshot: isPaymentScreenshotUploaded ? paymentScreenshot : null,
            selected_qr_code_url: selectedQrCodeUrl,
            selected_qr_code_name: selectedQrCodeNameLocal,
            shared_via_whatsapp: selectedQrCodeId === SHARE_QR_LINK_VALUE,
          };
          if (effectiveQrId.startsWith('common_')) {
            const qrId = effectiveQrId.replace('common_', '');
            const selectedQr =
              commonQrCodes.find((qr) => qr.id === qrId) ||
              allCommonQrCodes.find((qr) => qr.id === qrId);
            if (selectedQr && isDynamicUpiQr(selectedQr)) {
              qrPhotos.dynamic_upi = true;
              qrPhotos.upi_id = selectedQr.upiId;
              qrPhotos.payee_name = selectedQr.payeeName || selectedQr.name;
              if (selectedQr.phone) qrPhotos.phone = selectedQr.phone;
            }
          } else if (effectiveQrId.startsWith('technician_')) {
            const techId = effectiveQrId.replace('technician_', '');
            const selectedTech =
              technicians.find((t) => t.id === techId) ||
              allTechnicians.find((t) => t.id === techId);
            if (selectedTech && isDynamicUpiTechnician(selectedTech as any)) {
              qrPhotos.dynamic_upi = true;
              qrPhotos.upi_id = (selectedTech as any).upiId;
              qrPhotos.payee_name =
                (selectedTech as any).payeeName || selectedTech.fullName;
              if ((selectedTech as any).upiPhone) {
                qrPhotos.phone = (selectedTech as any).upiPhone;
              }
            }
          }
          requirements.push({ qr_photos: qrPhotos });
          console.log('✅ Added qr_photos to requirements:', qrPhotos);
        }
        if (
          paymentMode === 'PARTIAL' ||
          (paymentMode === 'PENDING_PAYMENT' &&
            pendingPaidTodayEnabled &&
            pendingPaidTodayMode === 'PARTIAL')
        ) {
          const cash = parseMoneyAmount(partialCashAmount);
          const online = parseMoneyAmount(partialOnlineAmount);
          requirements.push({
            partial_cash_amount: Number.isFinite(cash) ? cash : 0,
            partial_online_amount: Number.isFinite(online) ? online : 0,
          });
        }
        if (paymentMode === 'PENDING_PAYMENT') {
          const bill = Number.isFinite(parsedBill) ? parsedBill : 0;
          const balance = computePendingBalance(bill, paidTodayForPending);
          const customerId =
            (selectedJobForComplete as any).customer_id ||
            (selectedJobForComplete as any).customerId ||
            selectedJobForComplete.customer?.id;
          let reminderId: string | null = null;
          if (customerId && balance > 0) {
            const { id, error: remErr } = await createPendingPaymentReminderFromJob({
              customerId,
              jobId: selectedJobForComplete.id,
              jobNumber: selectedJobForComplete.jobNumber || (selectedJobForComplete as any).job_number,
              amountPending: balance,
              promisedDate: promisedPaymentDate,
            });
            if (remErr) {
              console.error('[pending-payment] reminder create failed', remErr);
              toast.error('Job will save, but pending payment reminder failed — add it in Settings.');
            } else {
              reminderId = id;
            }
          }
          requirements = upsertPendingPaymentInRequirements(requirements, {
            promised_date: promisedPaymentDate,
            amount_pending: balance,
            paid_today: paidTodayForPending,
            paid_today_mode: pendingPaidTodayEnabled
              ? (pendingPaidTodayMode as PaidTodayMode) || null
              : null,
            reminder_id: reminderId,
          });
        }
        if (
          paymentMode !== 'ONLINE' &&
          paymentMode !== 'PARTIAL' &&
          !(
            paymentMode === 'PENDING_PAYMENT' &&
            pendingPaidTodayEnabled &&
            (pendingPaidTodayMode === 'ONLINE' || pendingPaidTodayMode === 'PARTIAL')
          ) &&
          isPaymentScreenshotUploaded
        ) {
          // For CASH payments, still save payment screenshot in requirements for easy access
          // Store it in a payment_photos array in requirements
          requirements.push({ payment_photos: [paymentScreenshot] });
          console.log('✅ Added payment screenshot to requirements for CASH payment:', paymentScreenshot);
        }
        
        // Update after_photos field with all photos (bill photos + payment screenshot)
        if (allAfterPhotos.length > 0) {
          updateData.after_photos = allAfterPhotos;
          console.log('✅ Added all photos to after_photos:', allAfterPhotos);
          console.log('✅ Total photos count:', allAfterPhotos.length);
          console.log('✅ Bill photos count:', uploadedBillPhotos.length);
          console.log('✅ Payment screenshot included:', isPaymentScreenshotUploaded ? 'Yes' : 'No');
        } else {
          console.warn('⚠️ No photos to add to after_photos');
        }

        // When job had zero photos and technician added optional photos, plus any extra photos at step 6 → store in job.images
        const optionalUploadedForSave = optionalCompletionPhotos.filter(isUploadedMediaUrl);
        const extraStep6ForSave = extraPhotosStep6.filter(isUploadedMediaUrl);
        const allExtraImages = [...optionalUploadedForSave, ...extraStep6ForSave];
        if (allExtraImages.length > 0) {
          const existingImages = Array.isArray(latestJobData?.images) ? latestJobData.images : [];
          updateData.images = [...existingImages, ...allExtraImages];
          console.log('✅ Added optional + step-6 photos to job.images:', allExtraImages.length);
        }

        // Add AMC info for reference (technician provides this, admin will create official AMC)
        // Only add if years > 0 (0 years means no AMC)
        const effectiveHasAMC = hasAMC === true && amcYears > 0;
        if (effectiveHasAMC && amcServicePeriodKind) {
          const servicePeriodMonths =
            amcServicePeriodKind === 'no_auto' ? 0
              : amcServicePeriodKind === '4' ? 4
              : amcServicePeriodKind === '6' ? 6
              : Math.max(1, amcServicePeriodCustomMonths);
          const amcInfo = {
            date_given: amcDateGiven || null,
            end_date: amcEndDate || null,
            years: amcYears,
            amount: amcAmount ? parseFloat(amcAmount) : null,
            includes_prefilter: amcIncludesPrefilter ?? false,
            additional_info: amcAdditionalInfo || null,
            notes: amcAdditionalInfo || null,
            service_period_months: servicePeriodMonths,
            technician_reference: true // Mark as technician reference, not official AMC
          };
          requirements.push({ amc_info: amcInfo });
          console.log('✅ Added AMC info (reference) to requirements:', amcInfo);
        }

        if (dontSendMessageToCustomer) {
          requirements.push({ dont_send_message: true });
        }
        if (!askForReview) {
          requirements.push({ skip_review: true });
        }

        const requirementsBeforeDraft = [...requirements];
        const requirementsWithDraft = [
          ...requirementsBeforeDraft,
          { completion_draft: true, saved_at: new Date().toISOString() },
        ];

        const phaseAData = { ...updateData };
        delete phaseAData.status;
        delete phaseAData.end_time;
        delete phaseAData.completed_at;
        delete phaseAData.completed_by;
        phaseAData.requirements = JSON.stringify(requirementsWithDraft);

        const { error: phaseAError } = await withTimeout(
          db.jobs.update(jobId, phaseAData),
          30000,
          'Saving completion details is taking longer than expected'
        );
        if (phaseAError) {
          throw new Error(phaseAError.message);
        }

        // #3 Phase A is now persisted on the server. Stamp the draft so a
        // refresh / app kill in the next few seconds resumes in retry-only
        // mode instead of redoing every step (which would re-run Phase A).
        phaseASavedAtRef.current = Date.now();
        // #4 Capture a fingerprint of the data we just sent. If the user
        // later edits anything in this set, we flip retry mode off so a
        // subsequent submit re-runs Phase A + B with the new values.
        phaseASnapshotRef.current = computePhaseAFingerprint();
        try {
          const draftAfterPhaseA = captureCompleteJobDraft();
          if (draftAfterPhaseA) {
            writeTechnicianCompleteJobDraft({
              ...draftAfterPhaseA,
              phaseASavedAt: phaseASavedAtRef.current,
              retryPhaseBOnly: true,
              completeJobStep: 6,
            });
          }
        } catch {
          /* never let bookkeeping break submit */
        }

        const reqsForPhaseB = stripCompletionDraftMarkers(requirementsBeforeDraft);
        const phaseBData = {
          status: 'COMPLETED' as const,
          end_time: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          completed_by: user?.id || user?.technicianId || null,
          requirements: JSON.stringify(reqsForPhaseB),
        };
        const { error: phaseBError } = await withTimeout(
          db.jobs.update(jobId, phaseBData),
          30000,
          'Finalizing job completion is taking longer than expected'
        );
        if (phaseBError) {
          setCompletionRetryPhaseBOnly(true);
          const friendly = friendlyCompletionErrorMessage(phaseBError);
          setCompletionSubmitError(
            `${friendly} Your bill and photos are already saved — tap Retry finish to mark the job completed.`
          );
          // Persist the retry-only flag so a refresh / dialog close lands the
          // user back on the finish step instead of step 1.
          try {
            const draftRetry = captureCompleteJobDraft();
            if (draftRetry) {
              writeTechnicianCompleteJobDraft({
                ...draftRetry,
                phaseASavedAt: phaseASavedAtRef.current,
                retryPhaseBOnly: true,
                completeJobStep: 6,
              });
            }
          } catch {
            /* ignore */
          }
          setIsSubmittingJobCompletion(false);
          return;
        }

        await afterJobCompletionSaved(uploadedBillPhotos);

      } catch (submitError: any) {
        setIsSubmittingJobCompletion(false);
        const friendly = friendlyCompletionErrorMessage(submitError);
        setCompletionSubmitError(friendly);
        console.error('Job completion submission failed:', submitError);
        toast.error(friendly);
      }
    } catch (error: any) {
      setIsSubmittingJobCompletion(false);
      const friendly = friendlyCompletionErrorMessage(error);
      setCompletionSubmitError(friendly);
      console.error('Error preparing job completion:', error);
      toast.error(friendly);
    }
  };


  // Helper function to handle phone click
  const handlePhoneClick = (customer: any) => {
    const phone = customer?.phone;
    const alternatePhone = customer?.alternate_phone || customer?.alternatePhone;
    const fullName = customer?.full_name || customer?.fullName;
    
    if (alternatePhone) {
      setSelectedCustomerPhone({
        phone,
        alternate_phone: alternatePhone,
        full_name: fullName,
        customer_tier: customer?.customer_tier ?? (customer as any)?.customerTier ?? null,
      });
      setPhonePopupOpen(true);
    } else if (phone) {
      window.location.href = `tel:${phone}`;
    }
  };

  // Helper function to handle WhatsApp click
  const handleWhatsAppClick = (phone: string) => {
    if (!phone || phone.trim() === '') {
      toast.error('Phone number is required');
      return;
    }
    
    // Remove all non-digit characters
    const cleaned = phone.replace(/\D/g, '');
    
    // Validate phone number length
    if (cleaned.length < 10) {
      toast.error('Invalid phone number. Please enter a valid 10-digit phone number.');
      return;
    }
    
    // Format phone number for WhatsApp
    // Handle different phone number formats
    let formattedPhone = '';
    
    if (cleaned.length === 12 && cleaned.startsWith('91')) {
      // Already in correct format: 91XXXXXXXXXX
      formattedPhone = cleaned;
    } else if (cleaned.length === 10) {
      // 10-digit number, prepend country code 91
      formattedPhone = `91${cleaned}`;
    } else if (cleaned.length === 11 && cleaned.startsWith('0')) {
      // 11-digit number starting with 0, remove 0 and prepend 91
      formattedPhone = `91${cleaned.substring(1)}`;
    } else if (cleaned.length === 13 && cleaned.startsWith('91')) {
      // 13-digit number starting with 91, might have extra digit, take first 12
      formattedPhone = cleaned.substring(0, 12);
    } else if (cleaned.length >= 10) {
      // If it's longer than 10 digits, try to extract last 10 digits and prepend 91
      const last10 = cleaned.substring(cleaned.length - 10);
      formattedPhone = `91${last10}`;
    } else {
      toast.error('Invalid phone number format. Please enter a valid phone number.');
      return;
    }
    
    // Validate final format (should be 12 digits: 91 + 10 digits)
    if (formattedPhone.length !== 12 || !formattedPhone.startsWith('91')) {
      toast.error('Invalid phone number format. Please enter a valid Indian phone number.');
      return;
    }
    
    const whatsappUrl = `https://wa.me/${formattedPhone}`;
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
  };

  // Open WhatsApp: if customer has alternate number, show "which number?" dialog; else open directly
  const handleSendMessageClick = (
    phone: string,
    alternatePhone?: string,
    fullName?: string,
    customerTier?: string | null
  ) => {
    if (!phone?.trim()) return;
    const alt = alternatePhone?.trim();
    if (alt && alt !== phone) {
      setSelectedCustomerForWhatsApp({
        phone,
        alternate_phone: alt,
        full_name: fullName,
        customer_tier: customerTier ?? null,
      });
      setWhatsappNumberDialogOpen(true);
    } else {
      handleWhatsAppClick(phone);
    }
  };

  // Helper function to format address for display
  const formatAddressForDisplay = (address: any) => {
    if (!address) return 'Address not available';
    const parts = [];
    if (address.street) parts.push(address.street);
    if (address.area) parts.push(address.area);
    if (address.city) parts.push(address.city);
    if (address.state) parts.push(address.state);
    if (address.pincode) parts.push(address.pincode);
    return parts.join(', ') || 'Address not available';
  };

  /** Load photo arrays when slim list row has none (legacy after_photos / images). */
  const fetchJobPhotoUrlsForDialog = async (job: Job): Promise<string[]> => {
    const fromRow = collectAllPhotoUrlsFromJob(job);
    if (fromRow.length > 0) return fromRow;

    const { data: photoRows } = await db.jobs.getPhotoFieldsForJobIds([job.id]);
    const row = photoRows?.[0];
    if (!row) return [];

    const merged = { ...job, ...row } as Job;
    return collectAllPhotoUrlsFromJob(merged);
  };

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
        // Also check for nested objects that might contain URLs
        if (photo.public_id && typeof photo.public_id === 'string') {
          // This is a Cloudinary object, but we need the URL
          // Skip for now - we should have secure_url or url
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

  /** Disable Next / Complete while optional, bill, payment, or extra photos are still uploading (background; no toast). */
  const completeJobNextDisabledByUploads = useMemo(() => {
    if (completeJobStep === 1 && customerHasZeroPhotosAltogether) {
      if (isOptionalCompletionPhotosUploading || optionalCompletionPhotos.some(hasPendingLocalOrUploadingPhoto)) {
        return true;
      }
    }
    if (completeJobStep === 2 && (isBillPhotosUploading || billPhotos.some(hasPendingLocalOrUploadingPhoto))) {
      return true;
    }
    const billZero =
      billAmount === '' || isNaN(parseFloat(billAmount)) || parseFloat(billAmount) === 0;
    if (completeJobStep === 5 && !billZero) {
      if (isPaymentScreenshotUploading || hasPendingPaymentScreenshotState()) return true;
    }
    if (completeJobStep === 6 && (isExtraPhotosStep6Uploading || extraPhotosStep6.some(hasPendingLocalOrUploadingPhoto))) {
      return true;
    }
    return false;
  }, [
    completeJobStep,
    customerHasZeroPhotosAltogether,
    isOptionalCompletionPhotosUploading,
    optionalCompletionPhotos,
    isBillPhotosUploading,
    billPhotos,
    billAmount,
    isPaymentScreenshotUploading,
    paymentScreenshot,
    isExtraPhotosStep6Uploading,
    extraPhotosStep6,
  ]);

  // Helper function to get all photos for a customer (from jobs + customer-level photos without a job)
  const getAllCustomerPhotos = async (
    customerIdOrCustomer: string | { id?: string; customer_id?: string; customerId?: string }
  ): Promise<string[]> => {
    try {
      setLoadingCustomerPhotos(true);

      const customerUuid = await resolveCustomerUuidForQueries(customerIdOrCustomer);
      if (!customerUuid) {
        console.error('Error resolving customer UUID for photos');
        return [];
      }

      let customerRecord: any = null;
      const { data: customer, error: customerError } = await db.customers.getById(customerUuid);
      if (!customerError && customer) customerRecord = customer;

      const { data: customerJobs, error } =
        await db.jobs.getByCustomerIdForPhotoAggregationAsTechnician(customerUuid);

      if (error) {
        console.error('Error fetching customer jobs:', error);
      }

      const jobById = new Map<string, any>();
      for (const row of customerJobs || []) {
        if (row?.id) jobById.set(row.id, row);
      }
      for (const j of jobsRef.current) {
        const jobCustomerId = (j as any).customer_id || (j.customer as any)?.id;
        if (jobCustomerId === customerUuid && j.id && !jobById.has(j.id)) {
          jobById.set(j.id, j);
        }
      }

      let allCustomerJobs = Array.from(jobById.values());
      if (allCustomerJobs.length === 0 && error) {
        return [];
      }

      // Dashboard rows omit photo JSON — batch-load before/after/images for every job we know about.
      const jobIds = allCustomerJobs.map((j: { id?: string }) => j.id).filter(Boolean) as string[];
      if (jobIds.length > 0) {
        const { data: photoRows } = await db.jobs.getPhotoFieldsForJobIds(jobIds);
        if (photoRows?.length) {
          const photoById = new Map(photoRows.map((row: any) => [row.id, row]));
          allCustomerJobs = allCustomerJobs.map((job: any) => {
            const photoRow = photoById.get(job.id);
            if (!photoRow) return job;
            return {
              ...job,
              before_photos: photoRow.before_photos ?? job.before_photos ?? job.beforePhotos,
              after_photos: photoRow.after_photos ?? job.after_photos ?? job.afterPhotos,
              images: photoRow.images ?? job.images,
            };
          });
        }
      }

      const uniquePhotos = aggregateCustomerPhotoUrls(allCustomerJobs, customerRecord);
      if (import.meta.env.DEV) {
        console.log(
          `📸 Customer gallery: ${uniquePhotos.length} photo(s) from ${allCustomerJobs.length} job(s)`
        );
      }
      return uniquePhotos;
    } catch (error) {
      console.error('Error in getAllCustomerPhotos:', error);
      return [];
    } finally {
      setLoadingCustomerPhotos(false);
    }
  };

  // Helper function to get ordinal suffix (1st, 2nd, 3rd, 4th, etc.)
  const getOrdinalSuffix = (day: number): string => {
    if (day > 3 && day < 21) return 'th';
    switch (day % 10) {
      case 1: return 'st';
      case 2: return 'nd';
      case 3: return 'rd';
      default: return 'th';
    }
  };

  // Helper function to round time to nearest 10 minutes
  const roundToNearest10 = (hours: number, minutes: number): { hours: number; minutes: number } => {
    const roundedMinutes = Math.round(minutes / 10) * 10;
    if (roundedMinutes >= 60) {
      return { hours: hours + 1, minutes: 0 };
    }
    return { hours, minutes: roundedMinutes };
  };

  // Helper function to format scheduled time
  const formatScheduledTime = (job: Job): string => {
    const scheduledDate = (job as any).scheduled_date || job.scheduledDate;
    const scheduledTimeSlot = (job as any).scheduled_time_slot || job.scheduledTimeSlot;
    
    // Try to get custom time from multiple sources
    let customTime = (job.customer as any)?.customTime || (job.customer as any)?.custom_time;
    
    // Also check job requirements for custom_time
    if (!customTime && job.requirements) {
      try {
        const requirements = typeof job.requirements === 'string' 
          ? JSON.parse(job.requirements) 
          : job.requirements;
        
        if (Array.isArray(requirements)) {
          const customTimeReq = requirements.find((req: any) => req.custom_time);
          if (customTimeReq?.custom_time) {
            customTime = customTimeReq.custom_time;
          }
        } else if (requirements && typeof requirements === 'object' && requirements.custom_time) {
          customTime = requirements.custom_time;
        }
      } catch (e) {
        // Ignore parse errors
      }
    }
    
    if (!scheduledDate) return 'Not scheduled';
    
    const date = new Date(scheduledDate);
    
    // Format: "Monday, 7th November"
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
    const dayOfMonth = date.getDate();
    const monthName = date.toLocaleDateString('en-US', { month: 'long' });
    const ordinalSuffix = getOrdinalSuffix(dayOfMonth);
    const dateStr = `${dayName}, ${dayOfMonth}${ordinalSuffix} ${monthName}`;
    
    // Always show time if custom time exists, regardless of time slot
    if (customTime && /^\d{1,2}:\d{2}$/.test(String(customTime).trim())) {
      // Format custom time (HH:MM) to readable format (e.g., "2:44 AM")
      const [hours, minutes] = String(customTime).trim().split(':');
      const hour24 = parseInt(hours, 10);
      const minute24 = parseInt(minutes || '0', 10);
      if (!Number.isNaN(hour24)) {
        // Round to nearest 10 minutes
        const rounded = roundToNearest10(hour24, minute24);
        const roundedHour24 = rounded.hours;
        const roundedMinute = rounded.minutes;
        
        const hour12 = roundedHour24 > 12 ? roundedHour24 - 12 : (roundedHour24 === 0 ? 12 : roundedHour24);
        const ampm = roundedHour24 >= 12 ? 'PM' : 'AM';
        const formattedMinutes = String(roundedMinute).padStart(2, '0');
        
        return `${dateStr} ${hour12}:${formattedMinutes} ${ampm}`;
      }
    }
    if (scheduledTimeSlot) {
      // For time slots, show date and time slot
      const timeSlotMap: {[key: string]: string} = {
        'MORNING': 'Morning (9 AM - 12 PM)',
        'AFTERNOON': 'Afternoon (12 PM - 3 PM)',
        'EVENING': 'Evening (3 PM - 6 PM)',
        'CUSTOM': 'Custom Time'
      };
      // Legacy period label in custom_time
      if (
        !timeSlotMap[scheduledTimeSlot] &&
        customTime &&
        /morning|afternoon|evening/i.test(String(customTime))
      ) {
        return `${dateStr} - ${customTime}`;
      }
      return `${dateStr} - ${timeSlotMap[scheduledTimeSlot] || scheduledTimeSlot}`;
    }
    
    return dateStr;
  };

  const getStatusBadge = (status: string) => {
    // Don't show badge for ASSIGNED status (it has NEW badge instead)
    if (status === 'ASSIGNED') {
      return null;
    }

    const statusConfig = {
      PENDING: { color: 'bg-yellow-100 text-yellow-800', icon: Clock },
      EN_ROUTE: { color: 'bg-yellow-100 text-yellow-800', icon: Play },
      IN_PROGRESS: { color: 'bg-orange-100 text-orange-800', icon: Play },
      COMPLETED: { color: 'bg-green-100 text-green-800', icon: CheckCircle },
      CANCELLED: { color: 'bg-red-100 text-red-800', icon: AlertCircle },
      RESCHEDULED: { color: 'bg-purple-100 text-purple-800', icon: CalendarPlus },
      FOLLOW_UP: { color: 'bg-indigo-100 text-indigo-800', icon: CalendarPlus },
      DENIED: { color: 'bg-red-100 text-red-800', icon: XCircle },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.PENDING;
    const Icon = config.icon;

    return (
      <Badge className={`${config.color} border-0`}>
        <Icon className="w-3 h-3 mr-1" />
        {status.replace('_', ' ')}
      </Badge>
    );
  };

  const getStatusActions = (job: Job) => {
    const status = normalizeJobStatus((job as any).status || job.status);
    
    switch (status) {
      case 'ASSIGNED':
        return (
          <>
            <Button
              size="default"
              onClick={() => {
                markJobAsSeen(job.id);
                handleStartJob(job);
              }}
              disabled={isUpdating}
              className="bg-blue-600 hover:bg-blue-700 text-white h-10 flex-1"
            >
              <Play className="w-4 h-4 mr-2" />
              Start Job
            </Button>
            <Button
              size="default"
              variant="outline"
              className="h-10 w-12 p-0 flex-shrink-0"
              onClick={() => {
                markJobAsSeen(job.id);
                setSelectedJobForOptions(job);
                setOptionsDialogOpen(prev => ({ ...prev, [job.id]: true }));
              }}
            >
              <MoreVertical className="w-4 h-4" />
            </Button>
          </>
        );
      case 'EN_ROUTE':
        return (
          <>
            <Button
              size="default"
              onClick={() => {
                markJobAsSeen(job.id);
                handleStartWork(job);
              }}
              disabled={isUpdating}
              className="bg-orange-600 hover:bg-orange-700 text-white h-10 flex-1"
            >
              <Play className="w-4 h-4 mr-2" />
              Start Work
            </Button>
            <Button
              size="default"
              variant="outline"
              className="h-10 w-12 p-0 flex-shrink-0"
              onClick={() => {
                markJobAsSeen(job.id);
                setSelectedJobForOptions(job);
                setOptionsDialogOpen(prev => ({ ...prev, [job.id]: true }));
              }}
            >
              <MoreVertical className="w-4 h-4" />
            </Button>
          </>
        );
      case 'IN_PROGRESS':
        return (
          <>
            <Button
              size="default"
              onClick={() => {
                markJobAsSeen(job.id);
                handleCompleteJob(job);
              }}
              disabled={isUpdating}
              className="bg-green-600 hover:bg-green-700 text-white h-10 flex-1"
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Complete Job
            </Button>
            <Button
              size="default"
              variant="outline"
              className="h-10 w-12 p-0 flex-shrink-0"
              onClick={() => {
                markJobAsSeen(job.id);
                setSelectedJobForOptions(job);
                setOptionsDialogOpen(prev => ({ ...prev, [job.id]: true }));
              }}
            >
              <MoreVertical className="w-4 h-4" />
            </Button>
          </>
        );
      case 'COMPLETED': {
        const { missingBill, missingPayment, actionLabel } = getCompletedJobMissingMedia(job as any);
        if (!actionLabel) return null;
        const openJobOptions = () => {
          markJobAsSeen(job.id);
          setSelectedJobForOptions(job);
          setOptionsDialogOpen((prev) => ({ ...prev, [job.id]: true }));
        };
        const openMissingPhoto = (kind: 'bill' | 'payment') => {
          markJobAsSeen(job.id);
          setMissingPhotoUrls([]);
          setMissingPhotoSources({});
          setMissingPhotoDialog({ job, kind });
        };
        return (
          <Button
            size="default"
            variant="outline"
            className="h-10 w-full border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
            onClick={() => {
              if (missingBill && missingPayment) {
                // Both missing — open chooser with both labeled options.
                openJobOptions();
                return;
              }
              if (missingBill) openMissingPhoto('bill');
              else if (missingPayment) openMissingPhoto('payment');
            }}
          >
            <Camera className="w-4 h-4 mr-2 shrink-0" />
            <span className="truncate">{actionLabel}</span>
          </Button>
        );
      }
      default:
        return null;
    }
  };

  // 3-dot loading component
  const ThreeDotLoader = ({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) => {
    const dotSize = size === 'sm' ? 'w-2 h-2' : size === 'lg' ? 'w-4 h-4' : 'w-3 h-3';
    return (
      <div className="flex items-center justify-center space-x-1">
        <div className={`${dotSize} bg-black rounded-full animate-bounce`} style={{ animationDelay: '0ms' }}></div>
        <div className={`${dotSize} bg-black rounded-full animate-bounce`} style={{ animationDelay: '150ms' }}></div>
        <div className={`${dotSize} bg-black rounded-full animate-bounce`} style={{ animationDelay: '300ms' }}></div>
      </div>
    );
  };

  if (authInitializing && !authGraceExpired) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center p-4">
        <div className="text-center">
          <div className="flex items-center justify-center space-x-1">
            <div className="w-3 h-3 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-3 h-3 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-3 h-3 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
          <p className="text-muted-foreground text-sm mt-4">Checking authentication...</p>
        </div>
      </div>
    );
  }

  // Never paint the home shell for anonymous / wrong-role visitors (redirect-after-paint flash).
  if (user?.role !== 'technician') {
    return <Navigate to="/technician/login" replace />;
  }

  const ongoingCount = jobs.filter(isOngoingJob).length;
  const followUpCount = jobs.filter(job => normalizeJobStatus(job.status) === 'FOLLOW_UP').length;
  const deniedCount = jobs.filter(job => {
    if (job.status !== 'DENIED') return false;
    const technicianName = user?.fullName || '';
    const deniedBy = (job as any).denied_by || job.deniedBy || '';
    const deniedAt = (job as any).denied_at || job.deniedAt || null;
    
    // Only count jobs denied by this technician (not by admin)
    if (!deniedBy || deniedBy === 'Admin' || deniedBy !== technicianName) return false;
    
    // Only count if denied today
    if (!deniedAt) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Start of today
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1); // Start of tomorrow
    const deniedDate = new Date(deniedAt);
    return deniedDate >= today && deniedDate < tomorrow;
  }).length;
  // Count only today's completed jobs
  const today = new Date();
  const yesterdayStart = new Date(today);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  yesterdayStart.setHours(0, 0, 0, 0);
  const todayY = today.getFullYear(), todayM = today.getMonth(), todayD = today.getDate();
  const yesterdayY = yesterdayStart.getFullYear(), yesterdayM = yesterdayStart.getMonth(), yesterdayD = yesterdayStart.getDate();
  const completedCount = jobs.filter(job => {
    if (job.status !== 'COMPLETED') return false;
    const completedBy = (job as any).completed_by || (job as any).completedBy;
    const assignedToMe = (job as any).assigned_technician_id === user?.technicianId ||
      ((job as any).team_members && Array.isArray((job as any).team_members) && (job as any).team_members.includes(user?.technicianId));
    if (!completedBy && !assignedToMe) return false;
    if (completedBy && completedBy !== user?.technicianId && completedBy !== user?.id) return false;
    const completedAt = (job as any).completed_at || job.completedAt || (job as any).end_time || (job as any).endTime;
    if (!completedAt) return false;
    const completedDate = new Date(completedAt);
    const cY = completedDate.getFullYear(), cM = completedDate.getMonth(), cD = completedDate.getDate();
    return cY === todayY && cM === todayM && cD === todayD;
  }).length;
  const yesterdayCompletedCount = jobs.filter(job => {
    if (job.status !== 'COMPLETED') return false;
    const completedBy = (job as any).completed_by || (job as any).completedBy;
    const assignedToMe = (job as any).assigned_technician_id === user?.technicianId ||
      ((job as any).team_members && Array.isArray((job as any).team_members) && (job as any).team_members.includes(user?.technicianId));
    if (!completedBy && !assignedToMe) return false;
    if (completedBy && completedBy !== user?.technicianId && completedBy !== user?.id) return false;
    const completedAt = (job as any).completed_at || job.completedAt || (job as any).end_time || (job as any).endTime;
    if (!completedAt) return false;
    const completedDate = new Date(completedAt);
    const cY = completedDate.getFullYear(), cM = completedDate.getMonth(), cD = completedDate.getDate();
    return cY === yesterdayY && cM === yesterdayM && cD === yesterdayD;
  }).length;
  // Bottom Completed tab badge: show count for the selected day when on Completed tab, else today's count
  const completedTabCount = statusFilter === 'COMPLETED' && completedDateFilter === 'yesterday'
    ? yesterdayCompletedCount
    : completedCount;

  // Only show loading screen on initial load if we have no jobs and are actually loading
  // This prevents the flash when app opens with cached data or quick loads
  if (jobsLoading && jobs.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <ThreeDotLoader size="lg" />
          <p className="text-gray-600 mt-4">Loading your assigned jobs...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50" style={{ touchAction: 'auto', WebkitOverflowScrolling: 'touch', overscrollBehaviorY: 'auto' }}>
      {/* Header */}
      <div className="pt-8 px-4 bg-background/95 backdrop-blur-md border-b border-border/50 sticky top-0 z-50" style={{ touchAction: 'pan-y' }}>
        <header className="w-full max-w-7xl mx-auto py-3 px-6 md:px-8 flex items-center justify-between relative">
          {/* Spacer for balance */}
          <div className="w-16"></div>
          
          {/* Centered Logo */}
          <div className="absolute left-1/2 transform -translate-x-1/2 z-50">
            <div className="p-3 bg-background/95 backdrop-blur-md rounded-lg">
              <Logo showName={false} />
            </div>
          </div>
          
          {/* 3-dot menu on Right — opens centered options dialog */}
          <div className="flex items-center ml-auto z-50">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setHeaderOptionsDialogOpen(true)}
            >
              <MoreVertical className="w-4 h-4" />
            </Button>
          </div>
        </header>
      </div>

      {/* Centered options dialog (convenience on mobile) */}
      <Dialog open={headerOptionsDialogOpen} onOpenChange={setHeaderOptionsDialogOpen}>
        <DialogContent className="sm:max-w-sm gap-0 p-0 overflow-hidden">
          <DialogHeader className="p-4 pb-2">
            <DialogTitle className="text-center">Options</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col p-2 pb-4">
            <Button
              variant="ghost"
              className="justify-start h-12 px-4 text-base"
              onClick={() => {
                setHeaderOptionsDialogOpen(false);
                setTechnicianIdCardDialogOpen(true);
              }}
            >
              <QrCode className="w-5 h-5 mr-3" />
              Show ID Card QR
            </Button>
            <Button
              variant="ghost"
              className="justify-start h-12 px-4 text-base"
              onClick={() => {
                setHeaderOptionsDialogOpen(false);
                setCustomerSearchDialogOpen(true);
              }}
            >
              <Search className="w-5 h-5 mr-3" />
              Search Customer
            </Button>
            <Button
              variant="ghost"
              className="justify-start h-12 px-4 text-base"
              onClick={() => {
                setHeaderOptionsDialogOpen(false);
                setInventoryDialogOpen(true);
              }}
            >
              <Package className="w-5 h-5 mr-3" />
              My Inventory
            </Button>
            <Button
              variant="ghost"
              className="justify-start h-12 px-4 text-base"
              onClick={() => {
                setHeaderOptionsDialogOpen(false);
                // Uses cached snapshot + image data URLs; no forced network (rarely changes; realtime handles admin edits).
                setCommonQrDialogOpen(true);
              }}
            >
              <QrCode className="w-5 h-5 mr-3" />
              Common QR
            </Button>
            <Button
              variant="ghost"
              className="justify-start h-12 px-4 text-base"
              onClick={() => {
                setHeaderOptionsDialogOpen(false);
                const now = new Date();
                setBillingMonth(new Date(now.getFullYear(), now.getMonth(), 1));
                setBillingDialogOpen(true);
              }}
            >
              <Receipt className="w-5 h-5 mr-3" />
              View Billing
            </Button>
            <Button
              variant="ghost"
              className="justify-start h-12 px-4 text-base"
              onClick={() => window.location.reload()}
            >
              <RefreshCw className="w-5 h-5 mr-3" />
              Reload App
            </Button>
            <Button
              variant="ghost"
              className="justify-start h-12 px-4 text-base text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={() => {
                setHeaderOptionsDialogOpen(false);
                logout();
              }}
            >
              <LogOut className="w-5 h-5 mr-3" />
              Logout
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Location Error Banner */}
      {locationError && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
          <Card className="border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-red-800 dark:text-red-200 font-medium mb-1">Location Error:</p>
                  <p className="text-red-600 dark:text-red-300 text-sm mb-3">{locationError}</p>
                  <div className="flex flex-wrap gap-2">
                    {locationErrorType === 'permission' && (
                      <Button
                        onClick={() => {
                          setLocationError(null);
                          setLocationErrorType(null);
                          setLocationPermissionDenied(false);
                          getCurrentLocation();
                        }}
                        size="sm"
                        variant="outline"
                        className="border-red-300 text-red-700 hover:bg-red-100 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/30"
                      >
                        <RotateCcw className="w-4 h-4 mr-2" />
                        Request Permission Again
                      </Button>
                    )}
                    {(locationErrorType === 'upload' || locationErrorType === 'location') && (
                      <Button
                        onClick={() => {
                          setLocationError(null);
                          setLocationErrorType(null);
                          getCurrentLocation();
                        }}
                        size="sm"
                        variant="outline"
                        className="border-red-300 text-red-700 hover:bg-red-100 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/30"
                      >
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Try Again
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24" style={{ touchAction: 'auto', WebkitOverflowScrolling: 'touch', overscrollBehaviorY: 'auto' }}>

        {/* Office asked for the customer's OTP (Home Triangle jobs) */}
        {user?.technicianId && (
          <TechnicianOtpRequestCard
            technicianId={user.technicianId}
            jobs={jobs}
            onOtpSubmitted={(jobId, otp) => {
              setJobs((prev) =>
                prev.map((j) => {
                  if (j.id !== jobId) return j;
                  return {
                    ...j,
                    requirements: applyOtpToRequirements(
                      parseJobRequirements((j as any).requirements ?? j.requirements),
                      otp
                    ) as any,
                  };
                })
              );
              // If Complete Job wizard is open for this job, drop step 7 without re-entry.
              setSelectedJobForComplete((prev) => {
                if (!prev || prev.id !== jobId) return prev;
                return {
                  ...prev,
                  requirements: applyOtpToRequirements(
                    parseJobRequirements((prev as any).requirements ?? prev.requirements),
                    otp
                  ) as any,
                };
              });
            }}
          />
        )}

        {/* Job Assignment Requests Section */}
        {assignmentRequests.length > 0 && (
          <Card className="mb-6 border-orange-200 bg-orange-50">
            <CardHeader>
              <CardTitle className="flex items-center text-orange-800">
                <AlertCircle className="w-5 h-5 mr-2" />
                Pending Job Assignment Requests
                {assignmentRequestsLoading && (
                  <div className="ml-2">
                    <ThreeDotLoader size="sm" />
                  </div>
                )}
              </CardTitle>
              <CardDescription className="text-orange-700">
                You have {assignmentRequests.length} pending job assignment request{assignmentRequests.length > 1 ? 's' : ''}. 
                First technician to accept gets the job.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {assignmentRequests
                  .sort((a, b) => {
                    const distanceA = distances[(a.job as any)?.id] || 999999;
                    const distanceB = distances[(b.job as any)?.id] || 999999;
                    return distanceA - distanceB;
                  })
                  .map((request) => {
                  const job = request.job as any;
                  const customer = job?.customer as any;
                  const hasAmcR = Boolean(customerAMCStatus[customer?.id]);
                  const hasGR = Boolean(customer?.has_google_review);
                  const hasPriorR = techCustomerHasPriorService(customer, {
                    excludeJobId: (job as any)?.id,
                  });
                  const showPriorCornerR = hasPriorR && hasAmcR && !hasGR;
                  
                  return (
                    <Card key={request.id} className="border-orange-200">
                      <CardContent className="p-4">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <div className={`w-4 h-4 ${technicianCustomerIndicatorMainClass(hasAmcR, hasGR, hasPriorR)} rounded-sm flex items-center justify-center relative`}>
                                <div className="w-2 h-2 bg-white rounded-sm"></div>
                                {showPriorCornerR && (
                                  <div className="absolute -top-0.5 -left-0.5 w-1.5 h-1.5 bg-blue-600 rounded-full border border-white" title="Prior service (returning customer)"></div>
                                )}
                                {customerAMCStatus[customer?.id] && (
                                  <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-green-600 rounded-full border border-white" title="Active AMC"></div>
                                )}
                                {Boolean(customer?.has_google_review) && customerAMCStatus[customer?.id] && (
                                  <div className="absolute -bottom-0.5 -left-0.5 w-1.5 h-1.5 bg-orange-600 rounded-full border border-white" title="Google reviewed"></div>
                                )}
                                {Boolean(customer?.has_google_review) && !customerAMCStatus[customer?.id] && (
                                  <div className="absolute -bottom-0.5 -left-0.5 w-1.5 h-1.5 bg-white rounded-full border border-red-200" title="Google reviewed"></div>
                                )}
                              </div>
                              <span className={`font-bold text-lg text-gray-900 ${customerNameClassName(customer)}`}>
                                {customer?.full_name || 'N/A'}
                              </span>
                              {(() => {
                                const cid = customer?.id as string | undefined;
                                const lastBrand = cid ? customerLastServiceBrand[cid] : null;
                                return hasPriorR && lastBrand ? (
                                  <Badge className="bg-blue-100 text-blue-800 border-0 text-xs font-medium ml-2">
                                    Last served:
                                    <span className="block">{getServiceBrandLabel(lastBrand)}</span>
                                  </Badge>
                                ) : null;
                              })()}
                              <Badge className="bg-orange-100 text-orange-800 border-0">
                                <Clock className="w-3 h-3 mr-1" />
                                Pending Response
                              </Badge>
                            </div>
                            
                            <div className="space-y-3">
                              {/* Contact Information - Admin Style: 4 items - Desktop 1 row, Mobile 2x2 */}
                              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
                                {/* Phone */}
                                {customer?.phone && (
                                  <div className="bg-white rounded-lg p-3 border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all duration-200">
                                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                                      <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            e.preventDefault();
                                            handlePhoneClick(customer);
                                          }}
                                          className="cursor-pointer"
                                        >
                                          <Phone className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
                                        </button>
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="text-sm font-semibold text-gray-900 truncate">{customer.phone}</div>
                                        <div className="text-xs text-gray-500">Primary</div>
                                      </div>
                                    </div>
                                  </div>
                                )}

                                {/* Location - Always shown */}
                                {(() => {
                                  const address = customer?.address || (job as any)?.service_address;
                                  return (
                                    <div className="bg-white rounded-lg p-3 border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all duration-200">
                                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                                        <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                          <button
                                            onClick={() => {
                                              void openMapForJob(job as any);
                                            }}
                                            className="cursor-pointer"
                                          >
                                            {mapOpeningByJobId[String((job as any)?.id)] ? (
                                              <RefreshCw className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600 animate-spin" />
                                            ) : (
                                              <MapPin className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
                                            )}
                                          </button>
                              </div>
                                        <div className="flex-1 min-w-0">
                                          {(() => {
                                            const locDisplay = getJobLocationDisplay(job, customer);
                                            const label =
                                              locDisplay.visibleLabel &&
                                              locDisplay.visibleLabel !== 'Location'
                                                ? locDisplay.visibleLabel
                                                : locDisplay.address?.street?.trim()
                                                  ? 'View Address'
                                                  : 'No location';
                                            return (
                                              <>
                                                <div className="text-sm font-semibold text-gray-900">Location</div>
                                                <div className="text-xs text-gray-500">
                                                  <button
                                                    type="button"
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      void handleTechnicianLocationLabelClick(job as Job);
                                                    }}
                                                    className="text-left text-black hover:text-gray-700 hover:underline transition-colors cursor-pointer font-medium w-full text-left"
                                                    title="Click to view full address"
                                                  >
                                                    {label}
                                                  </button>
                                                </div>
                                              </>
                                            );
                                          })()}
                            </div>
                                      </div>
                                    </div>
                                  );
                                })()}

                                {/* Photos */}
                                {(() => {
                                  const customerRef = customer as any;
                                  const hasCustomerKey =
                                    customerRef?.id ||
                                    customerRef?.customer_id ||
                                    customerRef?.customerId;
                                  return (
                                    <div className="bg-white rounded-lg p-3 border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all duration-200">
                                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                                        <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                          <button
                                            onClick={async () => {
                                              if (hasCustomerKey) {
                                                setLoadingCustomerPhotos(true);
                                                const allCustomerPhotos = await getAllCustomerPhotos(customerRef);
                                                const resolvedId = await resolveCustomerUuidForQueries(customerRef);
                                                setSelectedJobPhotos({
                                                  jobId: job.id,
                                                  photos: allCustomerPhotos,
                                                  customerId: resolvedId ?? undefined,
                                                });
                                                setPhotosDialogOpen(true);
                                                setLoadingCustomerPhotos(false);
                                              } else {
                                                setLoadingCustomerPhotos(true);
                                                try {
                                                  const jobPhotos = await fetchJobPhotoUrlsForDialog(job);
                                                  setSelectedJobPhotos({ jobId: job.id, photos: jobPhotos });
                                                  setPhotosDialogOpen(true);
                                                } finally {
                                                  setLoadingCustomerPhotos(false);
                                                }
                                              }
                                            }}
                                            className="cursor-pointer"
                                            disabled={loadingCustomerPhotos}
                                          >
                                            <Camera className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
                                          </button>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <div className="text-sm font-semibold text-gray-900">Photos</div>
                                          <div className="text-xs text-gray-500">
                                            {loadingCustomerPhotos
                                              ? 'Loading...'
                                              : hasCustomerKey
                                                ? 'View all customer photos'
                                                : 'View photos'}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })()}

                                {/* WhatsApp - Last */}
                                {customer?.phone && (
                                  <div className="bg-white rounded-lg p-3 border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all duration-200">
                                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                                      <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            e.preventDefault();
                                            markJobAsSeen(job.id);
                                            handleSendMessageClick(
                                              customer.phone || '',
                                              (customer as any)?.alternate_phone || (customer as any)?.alternatePhone,
                                              (customer as any)?.full_name || (customer as any)?.fullName,
                                              (customer as any)?.customer_tier ?? null
                                            );
                                          }}
                                          className="cursor-pointer"
                                        >
                                          <svg className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488"/>
                                          </svg>
                                        </button>
                              </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="text-sm font-semibold text-gray-900">WhatsApp</div>
                                        <div className="text-xs text-gray-500">Send Message</div>
                                      </div>
                                    </div>
                                  </div>
                                )}

                              </div>



                              {/* Agreed Amount */}
                              {job?.agreed_amount || job?.estimated_cost || customer?.serviceCost ? (
                                <div className="text-sm">
                                  <span className="font-medium text-gray-700">Amount: </span>
                                  <span className="text-gray-600">₹{(job?.agreed_amount || job?.estimated_cost || customer?.serviceCost || 0).toLocaleString('en-IN')}</span>
                                </div>
                              ) : null}

                              {/* Description */}
                            {job?.description && (
                                <div className="text-sm">
                                  <span className="font-medium text-gray-700">Description: </span>
                                  <span className="text-gray-600">{job.description}</span>
                                </div>
                              )}
                            </div>
                          </div>
                          
                          <div className="flex flex-col sm:flex-row gap-2">
                            <Button
                              size="sm"
                              onClick={() => setSelectedRequest(request)}
                              className="bg-orange-600 hover:bg-orange-700"
                            >
                              <Eye className="w-4 h-4 mr-1" />
                              View Details
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleAssignmentResponse(request.id, 'ACCEPTED')}
                              disabled={isResponding}
                              className="bg-green-600 hover:bg-green-700"
                            >
                              <CheckCircle className="w-4 h-4 mr-1" />
                              Accept
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleAssignmentResponse(request.id, 'REJECTED')}
                              disabled={isResponding}
                              className="border-red-300 text-red-700 hover:bg-red-50"
                            >
                              <AlertCircle className="w-4 h-4 mr-1" />
                              Reject
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Section Title */}
        <div className="mb-4">
          <h2 className="text-xl font-bold text-gray-900 mb-1">
            {statusFilter === 'ONGOING' ? 'Your Ongoing Jobs' : 
             statusFilter === 'RESCHEDULED' ? 'Your Follow-up Jobs' :
             statusFilter === 'CANCELLED' ? 'Your Denied Jobs' :
             statusFilter === 'COMPLETED' ? 'Your Completed Jobs' :
             `Your ${statusFilter} Jobs`}
          </h2>
            {statusFilter === 'COMPLETED' && (
              <div className="flex gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => setCompletedDateFilter('today')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    completedDateFilter === 'today'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => setCompletedDateFilter('yesterday')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    completedDateFilter === 'yesterday'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  Yesterday
                </button>
              </div>
            )}
            <p className="text-xs text-gray-500 mb-3">
              {statusFilter === 'ONGOING' 
                ? `Showing ${filteredJobs.length} ongoing jobs (pending, assigned, in-progress)`
                : statusFilter === 'RESCHEDULED'
                ? `Showing ${filteredJobs.length} follow-up jobs`
                : statusFilter === 'CANCELLED'
                ? `Showing ${filteredJobs.length} denied jobs (today only)`
                : statusFilter === 'COMPLETED'
                ? `Showing ${filteredJobs.length} completed jobs (${completedDateFilter})`
                : `Showing ${filteredJobs.length} ${statusFilter.toLowerCase().replace('_', ' ')} jobs`
              }
            </p>
        </div>

        {/* Jobs List */}
        <div className="space-y-4">
          {filteredJobs.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <Wrench className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No jobs found</h3>
                <p className="text-gray-600">
                  {statusFilter === 'ONGOING'
                    ? 'You have no ongoing jobs at the moment.'
                    : statusFilter === 'RESCHEDULED'
                    ? 'You have no follow-up jobs scheduled.'
                    : statusFilter === 'CANCELLED'
                    ? 'You have no denied jobs today.'
                    : statusFilter === 'COMPLETED'
                    ? `You have no completed jobs for ${completedDateFilter}.`
                    : 'You have no jobs at the moment.'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
            {(() => {
              const showVisitRanks =
                visitOrderVisible &&
                statusFilter === 'ONGOING' &&
                filteredJobs.some((j) => getJobVisitOrder(j) != null);
              return filteredJobs.map((job, jobIndex) => {
              const visitRank = showVisitRanks ? jobIndex + 1 : null;
              // Extract follow-up information
              const followUpDate = (job as any).follow_up_date || job.followUpDate || null;
              const followUpTime = (job as any).follow_up_time || job.followUpTime || null;
              const followUpNotes = (job as any).follow_up_notes || job.followUpNotes || '';
              
              // Format follow-up date like "Monday, 7th November"
              const formattedFollowUpDate = followUpDate ? (() => {
                const date = new Date(followUpDate);
                const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
                const dayOfMonth = date.getDate();
                const monthName = date.toLocaleDateString('en-US', { month: 'long' });
                const ordinalSuffix = getOrdinalSuffix(dayOfMonth);
                return `${dayName}, ${dayOfMonth}${ordinalSuffix} ${monthName}`;
              })() : null;
              
              // Format follow-up time
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
              
              // Check if today is the follow-up date (compare only date parts, ignore time)
              const isFollowUpToday = followUpDate ? (() => {
                const today = new Date();
                const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                
                // Parse follow-up date (could be YYYY-MM-DD format or ISO string)
                let followUpStr = '';
                if (followUpDate.includes('T')) {
                  // ISO string format
                  const followUp = new Date(followUpDate);
                  followUpStr = `${followUp.getFullYear()}-${String(followUp.getMonth() + 1).padStart(2, '0')}-${String(followUp.getDate()).padStart(2, '0')}`;
                } else {
                  // Already in YYYY-MM-DD format
                  followUpStr = followUpDate.split('T')[0]; // Remove time part if present
                }
                
                return todayStr === followUpStr;
              })() : false;
              
              return (
                <div key={job.id} className="mb-4">
                  <Card 
                    className={`hover:shadow-md transition-shadow ${
                      isOpenAmcServiceJob(job)
                        ? 'border-2 border-blue-500'
                        : (job as any).status === 'IN_PROGRESS' || job.status === 'IN_PROGRESS'
                        ? 'border-2 border-orange-500' 
                        : (job as any).status === 'EN_ROUTE' || job.status === 'EN_ROUTE'
                        ? 'border-2 border-yellow-500'
                        : ((job as any).status === 'ASSIGNED' || job.status === 'ASSIGNED')
                        ? 'border-2 border-blue-500 bg-blue-50/30'
                        : job.status === 'FOLLOW_UP' && isFollowUpToday
                        ? 'border-2 border-purple-500 bg-purple-100'
                        : job.status === 'FOLLOW_UP'
                        ? 'border border-gray-200 bg-white'
                        : 'border border-gray-200'
                    }`}
                  >
                <CardContent className="p-6">
                  {/* Denial information inside the card */}
                      {job.status === 'DENIED' && (() => {
                    const denialReason = (job as any).denial_reason || job.denialReason || '';
                    const deniedBy = (job as any).denied_by || job.deniedBy || '';
                    const deniedAt = (job as any).denied_at || job.deniedAt || null;
                    const formattedDeniedAt = deniedAt ? new Date(deniedAt).toLocaleString() : null;
                    
                    if (!denialReason && !deniedBy && !deniedAt) return null;
                    
                    return (
                      <div className="mb-4 -mt-2 mx-0 sm:-mx-2">
                        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3">
                          <div className="flex items-start gap-3 mb-3">
                            <XCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                            <div className="space-y-1 text-sm text-gray-900 flex-1">
                              <div className="font-semibold text-red-900">
                                Job Denied
                              </div>
                              {deniedBy && (
                                <div className="text-gray-700">
                                  <span className="text-gray-500 font-medium">Denied by:</span> {deniedBy}
                                </div>
                              )}
                              {denialReason && (
                                <div className="text-gray-700">
                                  <span className="text-gray-500 font-medium">Reason:</span> {denialReason}
                                </div>
                              )}
                              {formattedDeniedAt && (
                                <div className="text-xs text-gray-500">
                                  Denied on {formattedDeniedAt}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                  {/* Follow-up information inside the card */}
                  {job.status === 'FOLLOW_UP' && (formattedFollowUpDate || formattedFollowUpTime || followUpNotes) && (
                    <div className="mb-4 -mt-2 mx-0 sm:-mx-2">
                      <div className="rounded-md border border-purple-200 bg-purple-50 px-3 py-3 sm:px-4 min-w-0">
                        <div className="flex items-start gap-3 mb-3">
                        <CalendarPlus className="w-5 h-5 text-purple-600 mt-0.5 flex-shrink-0" />
                        <div className="space-y-1 text-sm text-gray-900 flex-1">
                          <div className="font-semibold text-purple-900">
                            Follow-up scheduled for {formattedFollowUpDate || 'Date not set'}
                            {formattedFollowUpTime ? ` at ${formattedFollowUpTime}` : ''}
                          </div>
                            {followUpNotes && (
                          <div className="text-gray-700">
                                <span className="text-gray-500 font-medium">Reason:</span> {followUpNotes}
                          </div>
                            )}
                          </div>
                        </div>
                        {/* Action buttons: full-width stack on narrow phones (Button is whitespace-nowrap — side-by-side overflows) */}
                        <div className="mt-3 pt-3 border-t border-purple-200 flex flex-col gap-2 sm:flex-row sm:flex-nowrap sm:gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              markJobAsSeen(job.id);
                              handleScheduleFollowUp(job);
                            }}
                            disabled={isUpdating}
                            className="w-full sm:flex-1 sm:min-w-0 border-purple-300 text-purple-700 hover:bg-purple-100"
                          >
                            <CalendarPlus className="w-4 h-4 mr-2 shrink-0" />
                            Schedule Again
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              markJobAsSeen(job.id);
                              handleMoveToOngoing(job);
                            }}
                            disabled={isUpdating}
                            className="w-full sm:flex-1 sm:min-w-0 border-blue-300 text-blue-700 hover:bg-blue-100"
                          >
                            <ArrowRight className="w-4 h-4 mr-2 shrink-0" />
                            Move to Ongoing
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      {/* Customer name */}
                      <div className="flex items-center gap-2 mb-3 flex-wrap">
                          {visitRank != null ? (
                            <span
                              className={`flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 text-sm font-bold tabular-nums ${
                                visitRank === 1
                                  ? 'bg-red-600 text-white ring-2 ring-red-300'
                                  : 'bg-sky-100 text-sky-800'
                              }`}
                              title={visitRank === 1 ? 'Go here first' : `Stop #${visitRank}`}
                            >
                              #{visitRank}
                            </span>
                          ) : null}
                          {(() => {
                            const jc = job.customer as any;
                            const hasAmcJ = Boolean(customerAMCStatus[jc?.id]);
                            const hasGJ = Boolean(jc?.has_google_review);
                            const hasPriorJ = techCustomerHasPriorService(jc, { excludeJobId: job.id });
                            const showPriorCornerJ = hasPriorJ && hasAmcJ && !hasGJ;
                            return (
                          <div className={`w-4 h-4 ${technicianCustomerIndicatorMainClass(hasAmcJ, hasGJ, hasPriorJ)} rounded-sm flex items-center justify-center relative`}>
                            <div className="w-2 h-2 bg-white rounded-sm"></div>
                            {showPriorCornerJ && (
                              <div className="absolute -top-0.5 -left-0.5 w-1.5 h-1.5 bg-blue-600 rounded-full border border-white" title="Prior service (returning customer)"></div>
                            )}
                            {customerAMCStatus[jc?.id] && (
                              <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-green-600 rounded-full border border-white" title="Active AMC"></div>
                            )}
                            {Boolean(jc?.has_google_review) && customerAMCStatus[jc?.id] && (
                              <div className="absolute -bottom-0.5 -left-0.5 w-1.5 h-1.5 bg-orange-600 rounded-full border border-white" title="Google reviewed"></div>
                            )}
                            {Boolean(jc?.has_google_review) && !customerAMCStatus[jc?.id] && (
                              <div className="absolute -bottom-0.5 -left-0.5 w-1.5 h-1.5 bg-white rounded-full border border-red-200" title="Google reviewed"></div>
                            )}
                          </div>
                            );
                          })()}
                          <span className={`font-bold text-lg text-gray-900 ${customerNameClassName(job.customer as any)}`}>
                            {(job.customer as any)?.full_name || 'N/A'}
                          </span>
                        {getStatusBadge((job as any).status || job.status)}
                        {((job as any).status === 'ASSIGNED' || job.status === 'ASSIGNED') && !seenJobs.has(job.id) && (
                          <Badge className="bg-blue-100 text-blue-800 border-blue-300 animate-pulse shadow-lg shadow-blue-400/50 ring-2 ring-blue-400 ring-opacity-75">
                            NEW
                          </Badge>
                        )}
                        </div>
                      {(() => {
                        const jc = job.customer as any;
                        const hasPriorJ = techCustomerHasPriorService(jc, { excludeJobId: job.id });
                        const cid = jc?.id as string | undefined;
                        const lastBrand = cid ? customerLastServiceBrand[cid] : null;
                        return hasPriorJ && lastBrand ? (
                          <div className="mb-2">
                            <Badge className="bg-blue-100 text-blue-800 border-0 text-xs font-medium">
                              Last served:
                              <span className="block">{getServiceBrandLabel(lastBrand)}</span>
                            </Badge>
                          </div>
                        ) : null;
                      })()}
                      {/* Service type with Brand/Model */}
                      <div className="mb-3 space-y-1">
                        <div className="text-sm">
                          <span className="font-medium text-gray-700 inline-block w-28">Service Type:</span>
                          <span className="text-gray-600">{(job as any).service_type || job.serviceType} - {(job as any).service_sub_type || job.serviceSubType}</span>
                        </div>
                        {(() => {
                          const { brand: validBrand, model: validModel } = resolveJobEquipment(
                            job as unknown as Record<string, unknown>,
                            (job.customer as Record<string, unknown>) || null
                          );
                          if (!validBrand && !validModel) return null;
                          const displayText =
                            validBrand && validModel
                              ? `${validBrand} - ${validModel}`
                              : validBrand || validModel;
                          return (
                              <div className="text-sm">
                                <span className="font-medium text-gray-700 inline-block w-28">Equipment:</span>
                                <span className="text-gray-600">{displayText}</span>
                              </div>
                          );
                        })()}
                        {/* Scheduled Date and Time */}
                        {(() => {
                          const scheduledDate = (job as any).scheduled_date || job.scheduledDate;
                          const scheduledTimeSlot = (job as any).scheduled_time_slot || job.scheduledTimeSlot;
                          
                          if (scheduledDate) {
                            // Try to get custom time from requirements
                            let customTime = '';
                            if ((job as any).requirements) {
                              try {
                                const requirements = typeof (job as any).requirements === 'string' 
                                  ? JSON.parse((job as any).requirements) 
                                  : (job as any).requirements;
                                
                                if (Array.isArray(requirements)) {
                                  const customTimeReq = requirements.find((r: any) => r.custom_time);
                                  if (customTimeReq?.custom_time) {
                                    customTime = customTimeReq.custom_time;
                                  }
                                }
                              } catch (e) {
                                // Ignore parse errors
                              }
                            }
                            
                            const date = new Date(scheduledDate);
                            const dateStr = date.toLocaleDateString('en-IN', { 
                              weekday: 'short', 
                              day: 'numeric', 
                              month: 'short', 
                              year: 'numeric' 
                            });
                            
                            // Format custom time if available
                            let timeDisplay = '';
                            if (customTime && /^\d{1,2}:\d{2}$/.test(String(customTime).trim())) {
                              const [hours, minutes] = String(customTime).trim().split(':');
                              const hour24 = parseInt(hours, 10);
                              const minute24 = parseInt(minutes || '0', 10);
                              if (!Number.isNaN(hour24)) {
                                const hour12 = hour24 > 12 ? hour24 - 12 : (hour24 === 0 ? 12 : hour24);
                                const ampm = hour24 >= 12 ? 'PM' : 'AM';
                                const formattedMinutes = String(minute24).padStart(2, '0');
                                timeDisplay = `${hour12}:${formattedMinutes} ${ampm}`;
                              }
                            } else if (scheduledTimeSlot) {
                              const timeSlotMap: { [key: string]: string } = {
                                'MORNING': 'Morning (9 AM - 12 PM)',
                                'AFTERNOON': 'Afternoon (12 PM - 3 PM)',
                                'EVENING': 'Evening (3 PM - 6 PM)',
                                'CUSTOM': 'Custom Time'
                              };
                              timeDisplay = timeSlotMap[scheduledTimeSlot] || scheduledTimeSlot;
                              if (
                                !timeSlotMap[scheduledTimeSlot] &&
                                customTime &&
                                /morning|afternoon|evening/i.test(String(customTime))
                              ) {
                                timeDisplay = String(customTime);
                              }
                            } else if (customTime) {
                              timeDisplay = String(customTime);
                            }
                            
                            return (
                              <div className="text-sm">
                                <span className="font-medium text-gray-700 inline-block w-28">Scheduled:</span>
                                <span className="text-gray-600">
                                  {dateStr}
                                  {timeDisplay && ` - ${timeDisplay}`}
                                </span>
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </div>

                      {/* Lead Source */}
                      {(() => {
                        let leadSource = '';
                        try {
                          const requirements = (job as any).requirements;
                          if (requirements) {
                            let reqs = requirements;
                            if (typeof reqs === 'string') {
                              reqs = JSON.parse(reqs);
                            }
                            if (Array.isArray(reqs)) {
                              const req = reqs.find((r: any) => r?.lead_source);
                              if (req?.lead_source) {
                                leadSource = req.lead_source === 'Other' ? (req.lead_source_custom || 'Other') : req.lead_source;
                              }
                            } else if (reqs && typeof reqs === 'object' && reqs.lead_source) {
                              leadSource = reqs.lead_source === 'Other' ? (reqs.lead_source_custom || 'Other') : reqs.lead_source;
                            }
                          }
                        } catch (e) {
                          // Ignore parse errors
                        }
                        return leadSource ? (
                          <div className="text-sm mb-3">
                            <span className="font-medium text-gray-700 inline-block w-28">Lead Source:</span>
                            <span className="text-gray-600">{leadSource}</span>
                          </div>
                        ) : null;
                      })()}

                      {/* Raw Water TDS */}
                      {((job as any).customer?.raw_water_tds != null && (job as any).customer?.raw_water_tds > 0) && (
                        <div className="text-sm mb-3">
                          <span className="font-medium text-gray-700 inline-block w-28">Raw Water TDS:</span>
                          <span className="text-gray-600">{(job as any).customer.raw_water_tds} ppm</span>
                        </div>
                      )}

                      {/* Estimated Cost */}
                      {(job as any).estimated_cost ? (
                        <div className="text-sm mb-3">
                          <span className="font-medium text-gray-700 inline-block w-28">Estimated Cost:</span>
                          <span className="text-gray-600">INR {((job as any).estimated_cost || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                      ) : null}

                      {/* Description */}
                      {job.description && (
                        <div className="text-sm mb-4">
                          <span className="font-medium text-gray-700 inline-block w-28">Description:</span>
                          <span className="text-gray-600">{job.description}</span>
                        </div>
                      )}

                      {/* Payment Information for Completed Jobs */}
                      {statusFilter === 'COMPLETED' && (job.status === 'COMPLETED' || (job as any).status === 'COMPLETED') && (() => {
                        const paymentAmount = (job as any).payment_amount || (job as any).actual_cost || 0;
                        const paymentMethod = (job as any).payment_method || '';
                        
                        // Extract QR code info and partial amounts from requirements
                        let qrCodeInfo: any = null;
                        let partialCash = 0;
                        let partialOnline = 0;
                        try {
                          const requirements = (job as any).requirements;
                          if (requirements) {
                            let reqs = requirements;
                            if (typeof reqs === 'string') {
                              reqs = JSON.parse(reqs);
                            }
                            if (Array.isArray(reqs)) {
                              const qrReq = reqs.find((r: any) => r?.qr_photos);
                              if (qrReq?.qr_photos) {
                                qrCodeInfo = qrReq.qr_photos;
                              }
                              const partialReq = reqs.find((r: any) => r?.partial_cash_amount != null || r?.partial_online_amount != null);
                              if (partialReq) {
                                partialCash = Number(partialReq.partial_cash_amount) || 0;
                                partialOnline = Number(partialReq.partial_online_amount) || 0;
                              }
                            }
                          }
                        } catch (e) {
                          // Ignore parse errors
                        }
                        
                        // Determine payment type display
                        let paymentTypeDisplay = '';
                        if (paymentMethod === 'CASH') {
                          paymentTypeDisplay = 'Cash';
                        } else if (paymentMethod === 'PARTIAL') {
                          paymentTypeDisplay = `₹${partialCash.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} cash, ₹${partialOnline.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} online`;
                        } else if (qrCodeInfo?.selected_qr_code_name) {
                          paymentTypeDisplay = qrCodeInfo.selected_qr_code_name;
                        } else if (qrCodeInfo?.qr_code_type) {
                          paymentTypeDisplay = qrCodeInfo.qr_code_type;
                        } else if (paymentMethod) {
                          paymentTypeDisplay = paymentMethod.replace('_', ' ');
                        }
                        
                        if (paymentAmount > 0 || paymentMethod || qrCodeInfo) {
                          return (
                            <div className="mb-3 pt-3 border-t border-gray-200">
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-600">
                                {paymentAmount > 0 && (
                                  <span>
                                    <span className="font-medium text-gray-700">Amount:</span>{' '}
                                    <span className="text-gray-900">₹{paymentAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                  </span>
                                )}
                                {paymentMethod && (
                                  <span>
                                    <span className="font-medium text-gray-700">Mode:</span>{' '}
                                    <span className="text-gray-900">
                                      {paymentMethod === 'PARTIAL'
                                        ? `Partial (Cash + Online): ₹${partialCash.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} cash, ₹${partialOnline.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} online`
                                        : paymentMethod.replace('_', ' ')}
                                    </span>
                                  </span>
                                )}
                                {paymentTypeDisplay && paymentMethod !== 'PARTIAL' && (
                                  <span>
                                    <span className="font-medium text-gray-700">{paymentMethod === 'CASH' ? 'Type:' : 'QR:'}</span>{' '}
                                    <span className="text-gray-900">{paymentTypeDisplay}</span>
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        }
                        return null;
                      })()}

                      {/* View Bill & Add Parts for Completed Jobs (Add Reminder removed from completed section) */}
                      {statusFilter === 'COMPLETED' && (job.status === 'COMPLETED' || (job as any).status === 'COMPLETED') && (() => {
                        const { billPhotos } = resolveJobBillAndPaymentPhotos(job as any);
                        const hasBill = billPhotos.length > 0;
                        return (
                          <div className="mb-3 pt-3 border-t border-gray-200 flex flex-wrap gap-2">
                            {hasBill && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  if (billPhotos.length > 0) {
                                    setSelectedJobPhotos(null);
                                    setSelectedBillPhotos(billPhotos);
                                    setSelectedPhoto({ url: billPhotos[0], index: 0, total: billPhotos.length });
                                    setPhotoViewerOpen(true);
                                  }
                                }}
                                className="text-xs"
                              >
                                <Receipt className="w-3.5 h-3.5 mr-1.5" />
                                View Bill
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedJobForParts(job);
                                setPartsUsedDialogOpen(true);
                              }}
                              className="text-xs"
                            >
                              <Package className="w-3.5 h-3.5 mr-1.5" />
                              Add Parts
                            </Button>
                          </div>
                        );
                      })()}

                      <div className="space-y-3 mb-4">
                        {/* Contact Information - Admin Style: 4 items - Desktop 1 row, Mobile 2x2 */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
                          {/* Phone */}
                          {job.customer?.phone && (
                            <div className="bg-white rounded-lg p-3 border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all duration-200">
                              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                  <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    markJobAsSeen(job.id);
                                    handlePhoneClick(job.customer);
                                  }}
                                    className="cursor-pointer"
                                  >
                                    <Phone className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
                                  </button>
                          </div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-semibold text-gray-900 truncate">{job.customer.phone}</div>
                                  <div className="text-xs text-gray-500">Primary</div>
                        </div>
                          </div>
                        </div>
                          )}

                          {/* Location - Always shown */}
                          <div className="bg-white rounded-lg p-3 border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all duration-200">
                            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    // Mark job as seen when clicking map button
                                    markJobAsSeen(job.id);
                                    void openMapForJob(job as any);
                                  }}
                                  className="cursor-pointer"
                                >
                                  {mapOpeningByJobId[String(job.id)] ? (
                                    <RefreshCw className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600 animate-spin" />
                                  ) : (
                                    <MapPin className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
                                  )}
                                </button>
                        </div>
                              <div className="flex-1 min-w-0">
                                {(() => {
                                  const locDisplay = getJobLocationDisplay(job, job.customer);
                                  const label =
                                    locDisplay.visibleLabel &&
                                    locDisplay.visibleLabel !== 'Location'
                                      ? locDisplay.visibleLabel
                                      : locDisplay.address?.street?.trim()
                                        ? 'View Address'
                                        : 'No location';
                                  return (
                                    <>
                                      <div className="text-sm font-semibold text-gray-900">Location</div>
                                      <div className="text-xs text-gray-500">
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            markJobAsSeen(job.id);
                                            void handleTechnicianLocationLabelClick(job);
                                          }}
                                          className="text-left text-black hover:text-gray-700 hover:underline transition-colors cursor-pointer font-medium w-full text-left"
                                          title="Click to view full address"
                                        >
                                          {label}
                                        </button>
                                      </div>
                                    </>
                                  );
                                })()}
                          </div>
                            </div>
                      </div>
                        
                          {/* Photos */}
                          {(() => {
                            const customerRef = {
                              id: (job.customer as any)?.id || (job as any).customer_id,
                              customer_id:
                                (job.customer as any)?.customer_id ||
                                (job.customer as any)?.customerId,
                            };
                            const hasCustomerKey = Boolean(
                              customerRef.id || customerRef.customer_id
                            );
                            return (
                              <div className="bg-white rounded-lg p-3 border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all duration-200">
                                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                                  <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                    <button
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        markJobAsSeen(job.id);
                                        if (hasCustomerKey) {
                                          setLoadingCustomerPhotos(true);
                                          try {
                                            const allCustomerPhotos =
                                              await getAllCustomerPhotos(customerRef);
                                            const resolvedId =
                                              await resolveCustomerUuidForQueries(customerRef);
                                            setSelectedJobPhotos({
                                              jobId: job.id,
                                              photos: allCustomerPhotos,
                                              customerId: resolvedId ?? undefined,
                                            });
                                            setPhotosDialogOpen(true);
                                          } finally {
                                            setLoadingCustomerPhotos(false);
                                          }
                                        } else {
                                          setLoadingCustomerPhotos(true);
                                          try {
                                            const jobPhotos =
                                              await fetchJobPhotoUrlsForDialog(job);
                                            setSelectedJobPhotos({ jobId: job.id, photos: jobPhotos });
                                            setPhotosDialogOpen(true);
                                          } finally {
                                            setLoadingCustomerPhotos(false);
                                          }
                                        }
                                      }}
                                      className="cursor-pointer"
                                      disabled={loadingCustomerPhotos}
                                    >
                                      <Camera className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
                                    </button>
                          </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm font-semibold text-gray-900">Photos</div>
                                    <div className="text-xs text-gray-500">
                                      {loadingCustomerPhotos
                                        ? 'Loading...'
                                        : hasCustomerKey
                                          ? 'View all customer photos'
                                          : 'View photos'}
                      </div>
                    </div>
                                </div>
                              </div>
                            );
                          })()}

                          {/* WhatsApp - Last */}
                          {job.customer?.phone && (
                            <div className="bg-white rounded-lg p-3 border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all duration-200">
                              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      markJobAsSeen(job.id);
                                      const c = job.customer as any;
                                      handleSendMessageClick(
                                        c?.phone || '',
                                        c?.alternate_phone || c?.alternatePhone,
                                        c?.full_name || c?.fullName,
                                        c?.customer_tier ?? null
                                      );
                                    }}
                                    className="cursor-pointer"
                                  >
                                    <svg className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
                                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488"/>
                                    </svg>
                                  </button>
                              </div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-semibold text-gray-900">WhatsApp</div>
                                  <div className="text-xs text-gray-500">Send Message</div>
                              </div>
                              </div>
                              </div>
                          )}

                            </div>
                          </div>

                        {/* Agreed Amount */}
                        {(job as any).agreed_amount || (job.customer as any)?.serviceCost ? (
                          <div className="text-sm mb-4">
                            <span className="font-medium text-gray-700">Agreed Amount: </span>
                            <span className="text-gray-600">INR {((job as any).agreed_amount || (job.customer as any)?.serviceCost || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    {/* Job Action Buttons - At the bottom */}
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <div className="flex flex-row items-center gap-2">
                        {getStatusActions(job)}
                      </div>
                    </div>
                </CardContent>
              </Card>
                </div>
              );
            });
            })()}
            
            {/* Daily Summary for Completed Jobs */}
            {statusFilter === 'COMPLETED' && filteredJobs.length > 0 && (() => {
              let totalCash = 0;
              let totalOnline = 0;
              let totalAmount = 0;
              
              filteredJobs.forEach((job) => {
                const billing = resolveJobBillingAmount(
                  (job as any).payment_amount,
                  (job as any).actual_cost
                );
                if (billing <= 0) return;
                totalAmount += billing;
                const received = resolveReceivedCashAndOnline(job as any);
                totalCash += received.cash;
                totalOnline += received.online;
              });
              
              if (totalAmount > 0) {
                return (
                  <Card className="mt-6 border-2 border-green-500 bg-green-50">
                    <CardContent className="p-4 sm:p-6">
                      <div className="flex items-center gap-2 mb-4">
                        <Receipt className="w-5 h-5 sm:w-6 sm:h-6 text-green-700" />
                        <h3 className="text-lg sm:text-xl font-bold text-green-900">Today's Billing Summary</h3>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="bg-white rounded-lg p-3 sm:p-4 border border-green-200">
                          <div className="text-xs sm:text-sm text-gray-600 mb-1">Total Cash</div>
                          <div className="text-lg sm:text-2xl font-bold text-gray-900">
                            ₹{totalCash.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        </div>
                        <div className="bg-white rounded-lg p-3 sm:p-4 border border-green-200">
                          <div className="text-xs sm:text-sm text-gray-600 mb-1">Total Online/QR</div>
                          <div className="text-lg sm:text-2xl font-bold text-gray-900">
                            ₹{totalOnline.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        </div>
                        <div className="bg-white rounded-lg p-3 sm:p-4 border-2 border-green-500">
                          <div className="text-xs sm:text-sm text-gray-600 mb-1">Grand Total</div>
                          <div className="text-lg sm:text-2xl font-bold text-green-700">
                            ₹{totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              }
              return null;
            })()}
            </>
          )}
        </div>

        {/* Assignment Request Details Dialog */}
        <Dialog open={!!selectedRequest} onOpenChange={() => setSelectedRequest(null)}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Job Assignment Request Details</DialogTitle>
              <DialogDescription>
                Review the job details before accepting or rejecting this assignment
              </DialogDescription>
            </DialogHeader>
            
            {selectedRequest && (
              <div className="space-y-6">
                {(() => {
                  const job = selectedRequest.job as any;
                  const customer = job?.customer as any;
                  const hasAmcD = Boolean(customerAMCStatus[customer?.id]);
                  const hasGD = Boolean(customer?.has_google_review);
                  const hasPriorD = techCustomerHasPriorService(customer);
                  const showPriorCornerD = hasPriorD && hasAmcD && !hasGD;
                  
                  return (
                    <>
                      {/* Job Info */}
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <div className="flex items-center gap-2 mb-3">
                          <div className={`w-5 h-5 ${technicianCustomerIndicatorMainClass(hasAmcD, hasGD, hasPriorD)} rounded-sm flex items-center justify-center relative`}>
                            <div className="w-2.5 h-2.5 bg-white rounded-sm"></div>
                            {showPriorCornerD && (
                              <div className="absolute -top-0.5 -left-0.5 w-2 h-2 bg-blue-600 rounded-full border border-white" title="Prior service (returning customer)"></div>
                            )}
                            {customerAMCStatus[customer?.id] && (
                              <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-600 rounded-full border border-white" title="Active AMC"></div>
                            )}
                            {Boolean(customer?.has_google_review) && customerAMCStatus[customer?.id] && (
                              <div className="absolute -bottom-0.5 -left-0.5 w-2 h-2 bg-orange-600 rounded-full border border-white" title="Google reviewed"></div>
                            )}
                            {Boolean(customer?.has_google_review) && !customerAMCStatus[customer?.id] && (
                              <div className="absolute -bottom-0.5 -left-0.5 w-2 h-2 bg-white rounded-full border border-red-200" title="Google reviewed"></div>
                            )}
                          </div>
                          <span className={`font-bold text-xl text-gray-900 ${customerNameClassName(customer)}`}>
                            {customer?.full_name || 'N/A'}
                          </span>
                          <Badge className="bg-orange-100 text-orange-800 border-0">
                            <Clock className="w-3 h-3 mr-1" />
                            Pending Response
                          </Badge>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                          <div>
                            <p><strong>Service Type:</strong> {job?.service_type} - {job?.service_sub_type}</p>
                            {(() => {
                              const { brand: validBrand, model: validModel } = resolveJobEquipment(
                                (job || {}) as Record<string, unknown>,
                                (job?.customer as Record<string, unknown>) || null
                              );
                              if (!validBrand && !validModel) return null;
                              const displayText =
                                validBrand && validModel
                                  ? `${validBrand} - ${validModel}`
                                  : validBrand || validModel;
                              return (
                                  <p><strong>Equipment:</strong> {displayText}</p>
                              );
                            })()}
                            <p><strong>Priority:</strong> {job?.priority}</p>
                            <p><strong>Estimated Cost:</strong> ₹{job?.estimated_cost}</p>
                          </div>
                          <div>
                            <p><strong>Scheduled Date:</strong> {job?.scheduled_date}</p>
                            <p><strong>Time Slot:</strong> {job?.scheduled_time_slot}</p>
                            <p><strong>Duration:</strong> {job?.estimated_duration} minutes</p>
                          </div>
                        </div>
                      </div>

                      {/* Customer Info */}
                      <div className="bg-blue-50 p-4 rounded-lg">
                        <h4 className="font-semibold text-blue-900 mb-3">Customer Information</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                          <div>
                            <p><strong>Name:</strong>{' '}
                              <span className={customerNameClassName(customer)}>{customer?.full_name || 'N/A'}</span>
                            </p>
                            {customer?.phone && <p><strong>Phone:</strong> {customer.phone}</p>}
                            {customer?.email && <p><strong>Email:</strong> {customer.email}</p>}
                          </div>
                          <div>
                            <p><strong>Address:</strong></p>
                            <p className="text-gray-700">
                              {((customer?.address as any)?.street || (customer?.address as any)?.area) && (
                                <>
                                  {(customer?.address as any)?.street || ''}<br/>
                                  {(customer?.address as any)?.area || ''}<br/>
                                </>
                              )}
                              {((customer?.address as any)?.city || (customer?.address as any)?.pincode) && (
                                <>{(customer?.address as any)?.city || ''} - {(customer?.address as any)?.pincode || ''}</>
                              )}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Job Description */}
                      {job?.description && (
                        <div>
                          <h4 className="font-semibold text-gray-900 mb-2">Job Description</h4>
                          <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded-lg">
                            {job.description}
                          </p>
                        </div>
                      )}

                      {/* Response Notes */}
                      <div>
                        <label htmlFor="response-notes" className="block text-sm font-medium text-gray-700 mb-2">
                          Response Notes (Optional)
                        </label>
                        <Textarea
                          id="response-notes"
                          placeholder="Add any notes about your response..."
                          value={responseNotes}
                          onChange={(e) => setResponseNotes(e.target.value)}
                          rows={3}
                        />
                      </div>

                      {/* Action Buttons */}
                      <div className="flex justify-end gap-3 pt-4 border-t">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setSelectedRequest(null);
                            setResponseNotes('');
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => handleAssignmentResponse(selectedRequest.id, 'REJECTED')}
                          disabled={isResponding}
                          className="border-red-300 text-red-700 hover:bg-red-50"
                        >
                          <AlertCircle className="w-4 h-4 mr-2" />
                          Reject Assignment
                        </Button>
                        <Button
                          onClick={() => handleAssignmentResponse(selectedRequest.id, 'ACCEPTED')}
                          disabled={isResponding}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Accept Assignment
                        </Button>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Maps tap: ask before Start job (skipped when already EN_ROUTE / IN_PROGRESS) */}
        <AlertDialog
          open={mapsGoingDialog.open}
          onOpenChange={(open) => {
            if (!open) setMapsGoingDialog({ open: false, job: null });
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Going to this job now?</AlertDialogTitle>
              <AlertDialogDescription>
                Opening Maps. If you&apos;re heading there, we&apos;ll mark you as on the way and notify the office.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {(() => {
              const activeJob = mapsGoingDialog.job
                ? getActiveJob(mapsGoingDialog.job.id)
                : null;
              return activeJob ? <ActiveJobWarning activeJob={activeJob} /> : null;
            })()}
            {mapsGoingDialog.job && (
              <div className="bg-gray-50 p-3 rounded-lg text-sm">
                <p>
                  <strong>Customer:</strong>{' '}
                  <span className={customerNameClassName(mapsGoingDialog.job.customer as any)}>
                    {(mapsGoingDialog.job.customer as any)?.full_name ||
                      mapsGoingDialog.job.customer?.fullName ||
                      'Unknown'}
                  </span>
                </p>
                <p>
                  <strong>Service:</strong>{' '}
                  {(mapsGoingDialog.job as any).service_type ||
                    mapsGoingDialog.job.serviceType ||
                    'N/A'}
                </p>
              </div>
            )}
            <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
              <AlertDialogCancel
                onClick={() => {
                  const job = mapsGoingDialog.job;
                  setMapsGoingDialog({ open: false, job: null });
                  if (job) void openMapForJobDirect(job);
                }}
              >
                No, just open Maps
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={isUpdating}
                onClick={() => {
                  const job = mapsGoingDialog.job;
                  setMapsGoingDialog({ open: false, job: null });
                  if (job) startJobAndOpenMap(job);
                }}
                className="bg-blue-600 hover:bg-blue-700"
              >
                Yes, start job & open Maps
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Warning when starting a later stop before #1 */}
        <AlertDialog
          open={visitOrderSkipDialog.open}
          onOpenChange={(open) => {
            if (!open) {
              setVisitOrderSkipDialog({
                open: false,
                job: null,
                action: null,
                rank: 0,
                firstJob: null,
              });
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Start job #{visitOrderSkipDialog.rank} first?</AlertDialogTitle>
              <AlertDialogDescription>
                Admin set a visit order. You still have stop #1 waiting
                {visitOrderSkipDialog.firstJob
                  ? ` (${
                      (visitOrderSkipDialog.firstJob.customer as any)?.full_name ||
                      visitOrderSkipDialog.firstJob.customer?.fullName ||
                      'another customer'
                    })`
                  : ''}
                . You can continue with #{visitOrderSkipDialog.rank} if you need to.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                onClick={() =>
                  setVisitOrderSkipDialog({
                    open: false,
                    job: null,
                    action: null,
                    rank: 0,
                    firstJob: null,
                  })
                }
              >
                Go back
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  const job = visitOrderSkipDialog.job;
                  const action = visitOrderSkipDialog.action;
                  setVisitOrderSkipDialog({
                    open: false,
                    job: null,
                    action: null,
                    rank: 0,
                    firstJob: null,
                  });
                  if (job && action) {
                    proceedAfterVisitOrderCheck(job, action);
                  }
                }}
                className="bg-amber-600 hover:bg-amber-700"
              >
                Continue anyway
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Confirmation Dialog for Starting Job */}
        <AlertDialog open={confirmStartJobDialog.open} onOpenChange={(open) => {
          if (!open) {
            setConfirmStartJobDialog({ open: false, job: null });
          }
        }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Start Job</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to start this job? This will mark you as en route to the job location.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {(() => {
              const activeJob = confirmStartJobDialog.job
                ? getActiveJob(confirmStartJobDialog.job.id)
                : null;
              return activeJob ? <ActiveJobWarning activeJob={activeJob} /> : null;
            })()}
            {confirmStartJobDialog.job && (
              <div className="bg-gray-50 p-3 rounded-lg text-sm">
                <p>
                  <strong>Customer:</strong>{' '}
                  <span className={customerNameClassName(confirmStartJobDialog.job.customer as any)}>
                    {(confirmStartJobDialog.job.customer as any)?.full_name ||
                      confirmStartJobDialog.job.customer?.fullName ||
                      'Unknown'}
                  </span>
                </p>
                <p><strong>Service:</strong> {(confirmStartJobDialog.job as any).service_type || confirmStartJobDialog.job.serviceType || 'N/A'}</p>
              </div>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setConfirmStartJobDialog({ open: false, job: null })}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (confirmStartJobDialog.job) {
                    performStartJob(confirmStartJobDialog.job);
                    setConfirmStartJobDialog({ open: false, job: null });
                  }
                }}
                className="bg-blue-600 hover:bg-blue-700"
              >
                Start Job
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Confirmation Dialog for Starting Work */}
        <AlertDialog open={confirmStartWorkDialog.open} onOpenChange={(open) => {
          if (!open) {
            setConfirmStartWorkDialog({ open: false, job: null });
            setStartWorkOtp('');
            setStartWorkOtpError('');
          }
        }}>
          <AlertDialogContent>
            {(() => {
              const startWorkJob = confirmStartWorkDialog.job;
              // Prefer live jobs[] requirements — Ask OTP card / overlay may have
              // answered while this dialog was already open.
              const liveJob = startWorkJob
                ? jobs.find((j) => j.id === startWorkJob.id)
                : null;
              const effectiveStartWorkJob =
                startWorkJob && liveJob
                  ? {
                      ...startWorkJob,
                      requirements:
                        (liveJob as any).requirements ?? liveJob.requirements,
                    }
                  : startWorkJob;
              const startWorkNeedsOtp =
                jobRequiresOtp(effectiveStartWorkJob) &&
                !getJobEnteredOtp(effectiveStartWorkJob);
              return (
                <>
            <AlertDialogHeader>
              <AlertDialogTitle>Start Work</AlertDialogTitle>
              <AlertDialogDescription>
                {startWorkNeedsOtp
                  ? "Ask the customer for their 4-digit OTP to start work. It will be sent to the office."
                  : 'Are you sure you want to start work on this job? This will mark the job as in progress.'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {(() => {
              const activeJob = confirmStartWorkDialog.job
                ? getActiveJob(confirmStartWorkDialog.job.id)
                : null;
              return activeJob ? <ActiveJobWarning activeJob={activeJob} /> : null;
            })()}
            {confirmStartWorkDialog.job && (
              <div className="bg-gray-50 p-3 rounded-lg text-sm">
                <p>
                  <strong>Customer:</strong>{' '}
                  <span className={customerNameClassName(confirmStartWorkDialog.job.customer as any)}>
                    {(confirmStartWorkDialog.job.customer as any)?.full_name ||
                      confirmStartWorkDialog.job.customer?.fullName ||
                      'Unknown'}
                  </span>
                </p>
                <p><strong>Service:</strong> {(confirmStartWorkDialog.job as any).service_type || confirmStartWorkDialog.job.serviceType || 'N/A'}</p>
              </div>
            )}
            {startWorkNeedsOtp && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 sm:p-4">
                <Label className="text-sm font-semibold text-amber-900">Customer OTP *</Label>
                <p className="text-xs text-amber-700 mb-3">
                  Enter the customer's 4-digit code
                </p>
                <div className="flex justify-center">
                  <InputOTP
                    maxLength={4}
                    value={startWorkOtp}
                    inputMode="numeric"
                    pattern="^\d+$"
                    onChange={(value) => {
                      setStartWorkOtp(value.replace(/\D/g, ''));
                      setStartWorkOtpError('');
                    }}
                  >
                    <InputOTPGroup className="gap-2">
                      {[0, 1, 2, 3].map((i) => (
                        <InputOTPSlot
                          key={i}
                          index={i}
                          className="h-12 w-12 rounded-lg border border-amber-300 bg-white text-lg font-semibold text-amber-900 shadow-sm first:rounded-l-lg last:rounded-r-lg"
                        />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                {startWorkOtpError && (
                  <p className="text-sm text-red-500 mt-2 text-center">{startWorkOtpError}</p>
                )}
              </div>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => {
                setConfirmStartWorkDialog({ open: false, job: null });
                setStartWorkOtp('');
                setStartWorkOtpError('');
              }}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={startWorkNeedsOtp && startWorkOtp.length !== 4}
                onClick={(e) => {
                  if (!confirmStartWorkDialog.job) return;
                  if (startWorkNeedsOtp && startWorkOtp.length !== 4) {
                    e.preventDefault();
                    setStartWorkOtpError('Please enter all 4 digits');
                    return;
                  }
                  performStartWork(
                    confirmStartWorkDialog.job,
                    startWorkNeedsOtp ? startWorkOtp : undefined
                  );
                  setConfirmStartWorkDialog({ open: false, job: null });
                  setStartWorkOtp('');
                  setStartWorkOtpError('');
                }}
                className="bg-orange-600 hover:bg-orange-700 disabled:opacity-50"
              >
                Start Work
              </AlertDialogAction>
            </AlertDialogFooter>
                </>
              );
            })()}
          </AlertDialogContent>
        </AlertDialog>

        {/* Confirmation Dialog for Completing Job */}
        <AlertDialog open={confirmCompleteJobDialog.open} onOpenChange={(open) => {
          if (!open) {
            setConfirmCompleteJobDialog({ open: false, job: null });
          }
        }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Complete Job</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to complete this job? You will need to provide completion details including bill amount and photos.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {confirmCompleteJobDialog.job && (
              <div className="bg-gray-50 p-3 rounded-lg text-sm">
                <p>
                  <strong>Customer:</strong>{' '}
                  <span className={customerNameClassName(confirmCompleteJobDialog.job.customer as any)}>
                    {(confirmCompleteJobDialog.job.customer as any)?.full_name ||
                      confirmCompleteJobDialog.job.customer?.fullName ||
                      'Unknown'}
                  </span>
                </p>
                <p><strong>Service:</strong> {(confirmCompleteJobDialog.job as any).service_type || confirmCompleteJobDialog.job.serviceType || 'N/A'}</p>
              </div>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setConfirmCompleteJobDialog({ open: false, job: null })}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (confirmCompleteJobDialog.job) {
                    performCompleteJob(confirmCompleteJobDialog.job);
                    setConfirmCompleteJobDialog({ open: false, job: null });
                  }
                }}
                className="bg-green-600 hover:bg-green-700"
              >
                Continue to Complete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Bill Amount Confirmation Dialog */}
        <AlertDialog open={billAmountConfirmOpen} onOpenChange={setBillAmountConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm Bill Amount</AlertDialogTitle>
              <AlertDialogDescription>
                Please confirm the bill amount before proceeding:
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="py-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-gray-900 mb-2">
                  ₹{(() => {
                    const amount = parseMoneyAmount(billAmount);
                    const formatted = (Number.isFinite(amount) ? amount : 0).toLocaleString('en-IN', {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 2,
                    });
                    return formatted.replace(/\.00$/, '');
                  })()}
                </div>
                <div className="text-sm text-gray-500">
                  {selectedJobForComplete && (
                    <>
                      Job: {(selectedJobForComplete as any).job_number || selectedJobForComplete.jobNumber}
                    </>
                  )}
                </div>
              </div>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (customerHasZeroPhotosAltogether && (isOptionalCompletionPhotosUploading || optionalCompletionPhotos.some(hasPendingLocalOrUploadingPhoto))) {
                    return;
                  }
                  setBillAmountConfirmOpen(false);
                  setCompleteJobStep(2);
                }}
                className="bg-black hover:bg-gray-800 !text-white font-semibold"
              >
                Confirm & Continue
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={billPhotosSkipConfirmOpen} onOpenChange={setBillPhotosSkipConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure you want to skip bill photos?</AlertDialogTitle>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setBillPhotosSkipConfirmOpen(false);
                  advanceFromStep2([]);
                }}
                className="bg-black hover:bg-gray-800 !text-white font-semibold"
              >
                Yes
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

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
                <Label htmlFor="ongoing-date">Scheduled Date *</Label>
                <DatePicker
                  value={moveToOngoingDate || undefined}
                  onChange={(v) => v && setMoveToOngoingDate(v)}
                  placeholder="Pick date"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="ongoing-time-slot">Time Slot *</Label>
                <Select
                  value={moveToOngoingTimeSlot}
                  onValueChange={(value: 'MORNING' | 'AFTERNOON' | 'EVENING' | 'CUSTOM') => {
                    setMoveToOngoingTimeSlot(value);
                    // Set default time based on time slot
                    if (value === 'MORNING') {
                      setMoveToOngoingTime('09:00');
                      setMoveToOngoingCustomTime('');
                    } else if (value === 'AFTERNOON') {
                      setMoveToOngoingTime('14:00');
                      setMoveToOngoingCustomTime('');
                    } else if (value === 'EVENING') {
                      setMoveToOngoingTime('17:00');
                      setMoveToOngoingCustomTime('');
                    } else {
                      // CUSTOM - use current time
                      const now = new Date();
                      const customTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
                      setMoveToOngoingTime(customTime);
                      setMoveToOngoingCustomTime(customTime);
                    }
                  }}
                >
                  <SelectTrigger id="ongoing-time-slot" className="mt-1">
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
                  <Label htmlFor="ongoing-custom-time">Custom Time *</Label>
                <Input
                    id="ongoing-custom-time"
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
                  setMoveToOngoingTime('');
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

        {/* Deny Job Dialog */}
        <Dialog open={denyDialogOpen} onOpenChange={setDenyDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Deny Job</DialogTitle>
              <DialogDescription>
                Are you sure you want to deny this job? Please provide a reason.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              {selectedJobForDeny && (
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-medium text-gray-900 mb-2">Job Details</h4>
                  <p className="text-sm text-gray-600">
                    <strong>Job Number:</strong> {(selectedJobForDeny as any).job_number}
                  </p>
                  <p className="text-sm text-gray-600">
                    <strong>Customer:</strong>{' '}
                    <span className={customerNameClassName(selectedJobForDeny.customer as any)}>
                      {(selectedJobForDeny.customer as any)?.full_name || selectedJobForDeny.customer?.fullName || 'Unknown'}
                    </span>
                  </p>
                  <p className="text-sm text-gray-600">
                    <strong>Service:</strong> {(selectedJobForDeny as any).service_type || selectedJobForDeny.serviceType || 'N/A'} - {(selectedJobForDeny as any).service_sub_type || selectedJobForDeny.serviceSubType || 'N/A'}
                  </p>
                </div>
              )}
              
              <div>
                <label htmlFor="deny-reason" className="block text-sm font-medium text-gray-700 mb-2">
                  Reason for Denial *
                </label>
                <div className="relative">
                  <Textarea
                    ref={denyReasonInputRef}
                    id="deny-reason"
                    placeholder="Type a reason..."
                    value={denyReason}
                    onChange={(e) => {
                      setDenyReason(e.target.value);
                      setShowDenySuggestions(e.target.value.length > 0);
                    }}
                    onFocus={() => setShowDenySuggestions(denyReason.length > 0)}
                    onBlur={() => {
                      // Delay to allow clicking on suggestions
                      setTimeout(() => setShowDenySuggestions(false), 200);
                    }}
                    rows={3}
                    required
                    className="pr-10"
                  />
                  {showDenySuggestions && filteredDenialSuggestions.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-y-auto">
                      {filteredDenialSuggestions.map((suggestion, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setDenyReason(suggestion);
                            setShowDenySuggestions(false);
                            denyReasonInputRef.current?.blur();
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-gray-100 text-sm"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {!showDenySuggestions && denyReason.length === 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    Start typing to see suggested reasons
                  </p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => {
                  setDenyDialogOpen(false);
                  setSelectedJobForDeny(null);
                  setDenyReason('');
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleDenyJobSubmit}
                className="bg-red-600 hover:bg-red-700"
              >
                <XCircle className="w-4 h-4 mr-2" />
                Deny Job
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Complete Job Dialog */}
        <AlertDialog
          open={resumeCompleteJobDraftOpen}
          onOpenChange={(open) => {
            setResumeCompleteJobDraftOpen(open);
            if (!open) {
              // Just clear the pending-draft pointer. Do NOT touch selectedJobForComplete here:
              // the Resume action sets completeDialogOpen=true in the same tick and Radix
              // auto-fires this onOpenChange(false) with a stale closure value, which would
              // otherwise null out the job and silently break Next/Back inside the wizard.
              setCompleteJobDraftToResume(null);
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {completeJobDraftToResume?.retryPhaseBOnly
                  ? 'Finish previous completion?'
                  : 'Resume previous completion?'}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {completeJobDraftToResume?.retryPhaseBOnly
                  ? 'Bill and photos for this job were already saved on the server last time. Tap Finish to mark it completed.'
                  : `You have saved progress for this job (step ${completeJobDraftToResume?.completeJobStep ?? '?'}). Resume where you left off, or start over.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                onClick={() => {
                  if (selectedJobForComplete) {
                    clearTechnicianCompleteJobDraft(selectedJobForComplete.id);
                  }
                  setCompleteJobDraftToResume(null);
                  if (selectedJobForComplete) {
                    void openCompleteJobWizardFresh(selectedJobForComplete);
                  }
                }}
              >
                Start over
              </AlertDialogCancel>
              <AlertDialogAction
                className="bg-black hover:bg-gray-800"
                onClick={() => {
                  if (completeJobDraftToResume) {
                    applyCompleteJobDraft(completeJobDraftToResume);
                  }
                  setCompleteJobDraftToResume(null);
                  setCompleteDialogOpen(true);
                  const job = selectedJobForComplete;
                  const cid =
                    (job?.customer as any)?.id ||
                    job?.customer?.id ||
                    (job as any)?.customer_id ||
                    job?.customerId;
                  if (job?.id && cid) {
                    void (async () => {
                      try {
                        const allPhotos = await getAllCustomerPhotos(cid);
                        const customerHasNoPhotosAtAll = allPhotos.length === 0;
                        setCustomerHasZeroPhotosAltogether(customerHasNoPhotosAtAll);
                        if (!customerHasNoPhotosAtAll) return;

                        const { data: custRow } = await supabase
                          .from('customers')
                          .select('id,photos,full_name')
                          .eq('id', cid)
                          .maybeSingle();
                        const { nudgeTechCustomerProfileGaps } = await import(
                          '@/lib/nudgeTechCustomerProfile'
                        );
                        nudgeTechCustomerProfileGaps({
                          jobId: job.id,
                          customer: custRow || (job.customer as Record<string, unknown>),
                          phase: 'start',
                          showToast: true,
                          customerHasNoPhotosAtAll: true,
                        });
                      } catch {
                        setCustomerHasZeroPhotosAltogether(false);
                      }
                    })();
                  }
                }}
              >
                {completeJobDraftToResume?.retryPhaseBOnly ? 'Finish' : 'Resume'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Dialog open={completeDialogOpen} onOpenChange={(open) => {
          if (!open && !isSubmittingJobCompletion) {
            const draft = captureCompleteJobDraft();
            if (draft) writeTechnicianCompleteJobDraft(draft);
            setCompleteDialogOpen(false);
            setSelectedJobForComplete(null);
            resetCompleteJobFormState();
          }
        }}>
          <DialogContent className="w-[95vw] sm:w-[500px] max-w-[500px] h-[85vh] sm:h-[600px] max-h-[85vh] flex flex-col p-0">
            <DialogHeader className="px-6 pt-6 pb-4 flex-shrink-0 border-b">
              <DialogTitle>Complete Job</DialogTitle>
              <DialogDescription>
                {isSubmittingJobCompletion ? (
                  <span className="text-blue-600 font-medium">
                    Submitting job completion… Your progress is saved locally and on the server.
                  </span>
                ) : completionSubmitError ? (
                  <span className="text-red-600 font-medium">{completionSubmitError}</span>
                ) : (
                  <>
                    {completeJobStep === 1 && 'Select service brand & enter bill amount'}
                    {completeJobStep === 2 && 'Upload bill photo (optional)'}
                    {completeJobStep === 3 && 'AMC Information (Optional - Can Skip)'}
                    {completeJobStep === 4 && 'Select payment mode and QR code'}
                    {completeJobStep === 5 && 'Upload payment screenshot (optional)'}
                    {completeJobStep === 7 && 'Enter OTP Verification'}
                    {completeJobStep === 6 && !isSoftenerService() && 'Does the customer have a prefilter?'}
                    {completeJobStep === 6 && isSoftenerService() && 'Complete Job'}
                  </>
                )}
              </DialogDescription>
            </DialogHeader>
            
            {/* Scrollable Content - iOS Safari fix for scrolling */}
            <div 
              id="complete-job-scroll-container"
              className="flex-1 overflow-y-auto px-4 sm:px-6 py-3 sm:py-4"
              style={{
                WebkitOverflowScrolling: 'touch',
                touchAction: 'pan-y',
                overscrollBehavior: 'contain',
                minHeight: 0, // Important for flex children to allow shrinking
                position: 'relative', // Ensure proper stacking context
              }}
            >
              {selectedJobForComplete && (
                <>
                  {/* Optional "Add photo" — only when this customer has no photos anywhere (not per-job). */}
                  {completeJobStep === 1 && customerHasZeroPhotosAltogether && (
                    <div className="mb-4 w-full max-w-full">
                      <CompletionPhotoStep
                        label="Add customer photos (optional)"
                        hint="This customer has no photos yet — capture the RO unit if you can."
                        images={optionalCompletionPhotos}
                        onImagesChange={setOptionalCompletionPhotos}
                        onUploadStateChange={setIsOptionalCompletionPhotosUploading}
                        maxImages={5}
                        folder="job-photos"
                        jobId={selectedJobForComplete?.id}
                        photoType="after"
                      />
                    </div>
                  )}

                <div className="p-3 sm:p-4 bg-gray-50 rounded-lg mb-4">
                  <div className="text-xs sm:text-sm font-medium text-gray-900">
                    Job: {(selectedJobForComplete as any).job_number || selectedJobForComplete.jobNumber}
                  </div>
                  <div className="text-sm text-gray-600">
                    {(selectedJobForComplete.serviceType || (selectedJobForComplete as any).service_type || 'N/A')} - {(selectedJobForComplete.serviceSubType || (selectedJobForComplete as any).service_sub_type || 'N/A')}
                  </div>
                  <div className="text-sm text-gray-600">
                    Customer:{' '}
                    <span className={customerNameClassName(selectedJobForComplete.customer as any)}>
                      {selectedJobForComplete.customer?.fullName ||
                        (selectedJobForComplete.customer as any)?.full_name ||
                        (selectedJobForComplete.customer as any)?.name ||
                        'Unknown'}
                    </span>
                  </div>
                </div>
                </>
              )}
              
              {/* Step Indicator - Fixed horizontal scroll and border clipping */}
              <div className="flex items-center justify-center mb-6 overflow-x-auto pb-2 -mx-2 px-2">
                <div className="flex items-center space-x-0.5 sm:space-x-1 min-w-0 flex-shrink-0 py-1">
                  {/* Step 1 - Bill Amount */}
                  <div className={`flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 rounded-full text-xs font-medium flex-shrink-0 relative ${
                    completeJobStep === 1 ? 'bg-black text-white' : 
                    completeJobStep > 1 ? 'bg-black text-white' : 
                    'bg-gray-200 text-gray-600'
                  }`}>
                    {completeJobStep === 1 && (
                      <div className="absolute inset-0 rounded-full border-2 border-black" style={{ margin: '-2px' }}></div>
                    )}
                    <span className="relative z-10">1</span>
                  </div>
                  <div className={`w-4 sm:w-6 md:w-8 h-0.5 sm:h-1 transition-colors flex-shrink-0 ${
                    completeJobStep >= 2 ? 'bg-black' : 'bg-gray-200'
                  }`}></div>
                  
                  {/* Step 2 - Bill Photo */}
                  <div className={`flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 rounded-full text-xs font-medium flex-shrink-0 relative ${
                    completeJobStep === 2 ? 'bg-black text-white' : 
                    completeJobStep > 2 ? 'bg-black text-white' : 
                    'bg-gray-200 text-gray-600'
                  }`}>
                    {completeJobStep === 2 && (
                      <div className="absolute inset-0 rounded-full border-2 border-black" style={{ margin: '-2px' }}></div>
                    )}
                    <span className="relative z-10">2</span>
                  </div>
                  <div className={`w-4 sm:w-6 md:w-8 h-0.5 sm:h-1 transition-colors flex-shrink-0 ${
                    completeJobStep >= 3 ? 'bg-black' : 'bg-gray-200'
                  }`}></div>
                  
                  {/* Step 3 - AMC Info */}
                  <div className={`flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 rounded-full text-xs font-medium flex-shrink-0 relative ${
                    completeJobStep === 3 ? 'bg-black text-white' : 
                    completeJobStep > 3 ? 'bg-black text-white' : 
                    'bg-gray-200 text-gray-600'
                  }`}>
                    {completeJobStep === 3 && (
                      <div className="absolute inset-0 rounded-full border-2 border-black" style={{ margin: '-2px' }}></div>
                    )}
                    <span className="relative z-10">3</span>
                  </div>
                  <div className={`w-4 sm:w-6 md:w-8 h-0.5 sm:h-1 transition-colors flex-shrink-0 ${
                    completeJobStep >= 4 ? 'bg-black' : 'bg-gray-200'
                  }`}></div>
                  
                  {/* Step 4 - Payment Mode */}
                  <div className={`flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 rounded-full text-xs font-medium flex-shrink-0 relative ${
                    completeJobStep === 4 ? 'bg-black text-white' : 
                    completeJobStep > 4 ? 'bg-black text-white' : 
                    'bg-gray-200 text-gray-600'
                  }`}>
                    {completeJobStep === 4 && (
                      <div className="absolute inset-0 rounded-full border-2 border-black" style={{ margin: '-2px' }}></div>
                    )}
                    <span className="relative z-10">4</span>
                  </div>
                  <div className={`w-4 sm:w-6 md:w-8 h-0.5 sm:h-1 transition-colors flex-shrink-0 ${
                    completeJobStep >= 5 ? 'bg-black' : 'bg-gray-200'
                  }`}></div>
                  
                  {/* Step 5 - Payment Screenshot */}
                  <div className={`flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 rounded-full text-xs font-medium flex-shrink-0 relative ${
                    completeJobStep === 5 ? 'bg-black text-white' : 
                    completeJobStep > 5 ? 'bg-black text-white' : 
                    'bg-gray-200 text-gray-600'
                  }`}>
                    {completeJobStep === 5 && (
                      <div className="absolute inset-0 rounded-full border-2 border-black" style={{ margin: '-2px' }}></div>
                    )}
                    <span className="relative z-10">5</span>
                  </div>
                  <div className={`w-4 sm:w-6 md:w-8 h-0.5 sm:h-1 transition-colors flex-shrink-0 ${
                    completeJobStep >= (needsOtpStep() ? 7 : 6) ? 'bg-black' : 'bg-gray-200'
                  }`}></div>
                  
                  {/* Step 6 - Prefilter (or Step 7 - OTP if required) */}
                  {needsOtpStep() ? (
                    <>
                      {/* Step 7 - OTP Verification */}
                      <div className={`flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 rounded-full text-xs font-medium flex-shrink-0 relative ${
                        completeJobStep === 7 ? 'bg-black text-white' : 
                        completeJobStep > 7 ? 'bg-black text-white' : 
                        'bg-gray-200 text-gray-600'
                      }`}>
                        {completeJobStep === 7 && (
                          <div className="absolute inset-0 rounded-full border-2 border-black" style={{ margin: '-2px' }}></div>
                        )}
                        <span className="relative z-10">7</span>
                      </div>
                      <div className={`w-4 sm:w-6 md:w-8 h-0.5 sm:h-1 transition-colors flex-shrink-0 ${
                        completeJobStep >= 6 ? 'bg-black' : 'bg-gray-200'
                      }`}></div>
                      
                      {/* Step 6 - Prefilter */}
                      <div className={`flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 rounded-full text-xs font-medium flex-shrink-0 relative ${
                        completeJobStep === 6 ? 'bg-black text-white' : 
                        'bg-gray-200 text-gray-600'
                      }`}>
                        {completeJobStep === 6 && (
                          <div className="absolute inset-0 rounded-full border-2 border-black" style={{ margin: '-2px' }}></div>
                        )}
                        <span className="relative z-10">6</span>
                      </div>
                    </>
                  ) : (
                    <div className={`flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 rounded-full text-xs font-medium flex-shrink-0 relative ${
                      completeJobStep === 6 ? 'bg-black text-white' : 
                      'bg-gray-200 text-gray-600'
                    }`}>
                      {completeJobStep === 6 && (
                        <div className="absolute inset-0 rounded-full border-2 border-black" style={{ margin: '-2px' }}></div>
                      )}
                      <span className="relative z-10">6</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Step 1: Service Brand + Bill Amount */}
              {completeJobStep === 1 && (
                <div className="space-y-4">
                <div className="space-y-3">
                  <Label className="text-base font-semibold">Service brand for this visit *</Label>
                  <p className="text-sm text-gray-600">
                    {isLoadingServiceBrand
                      ? 'Checking last completed job...'
                      : lastServiceBrand
                        ? `Last time served as ${getServiceBrandLabel(lastServiceBrand)}`
                        : 'No previous brand history found. Please select the service brand.'}
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() => setServiceBrand('elevenro')}
                      className={`p-4 rounded-lg border-2 transition-all duration-200 ${
                        serviceBrand === 'elevenro'
                          ? 'border-black bg-black text-white shadow-md'
                          : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50'
                      }`}
                    >
                      <span className="font-medium text-sm">ElevenRO</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setServiceBrand('hydrogenro')}
                      className={`p-4 rounded-lg border-2 transition-all duration-200 ${
                        serviceBrand === 'hydrogenro'
                          ? 'border-black bg-black text-white shadow-md'
                          : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50'
                      }`}
                    >
                      <span className="font-medium text-sm">HydrogenRO</span>
                    </button>
                  </div>
                </div>
              <div>
                    <Label htmlFor="bill-amount">Bill Amount *</Label>
                    <Input
                      id="bill-amount"
                      type="text"
                      inputMode="decimal"
                      placeholder="Enter bill amount"
                      value={billAmount}
                      onChange={(e) => {
                        setBillAmount(sanitizeMoneyInput(e.target.value));
                      }}
                      className="mt-1"
                    />
                    {billAmount && Number.isFinite(parseMoneyAmount(billAmount)) && parseMoneyAmount(billAmount) > 0 && (
                      <p className="text-sm text-gray-600 mt-2">
                        Bill Amount: ₹{(() => {
                          const amount = parseMoneyAmount(billAmount);
                          const formatted = amount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
                          return formatted.replace(/\.00$/, '');
                        })()}
                      </p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="completion-notes">Completion Notes (Optional)</Label>
                <Textarea
                  id="completion-notes"
                      placeholder="Add any notes about the job completion..."
                  value={completionNotes}
                  onChange={(e) => {
                    setCompletionNotes(e.target.value);
                  }}
                  rows={3}
                      className="mt-1"
                />
              </div>
            </div>
              )}

              {/* Step 2: Bill Photo */}
              {completeJobStep === 2 && (
                <CompletionPhotoStep
                  label="Bill photo (optional)"
                  hint="Photo of the signed bill or handwritten invoice."
                  images={billPhotos}
                  onImagesChange={setBillPhotos}
                  onCaptureSourcesChange={(sources) =>
                    setBillPhotoSources((prev) => ({ ...prev, ...sources }))
                  }
                  onUploadStateChange={setIsBillPhotosUploading}
                  maxImages={5}
                  folder="bills"
                  jobId={selectedJobForComplete?.id}
                  photoType="bill"
                />
              )}

              {/* Step 3: AMC Information (Optional - Can Skip) - only show if bill is not zero and not softener */}
              {completeJobStep === 3 && !isBillAmountZero() && !isSoftenerService() && (
                <div className="space-y-4">
                  {hasAMC === null ? (
                    <>
                      <div className="space-y-3">
                        <Label className="text-base font-semibold">Does the customer need AMC?</Label>
                        <p className="text-sm text-gray-600 mb-4">
                          This information is for reference only. The admin will generate the official AMC contract.
                        </p>
                        <div className="grid grid-cols-2 gap-4">
                          <button
                            type="button"
                            onClick={() => {
                              setHasAMC(true);
                            }}
                            className={`p-4 rounded-lg border-2 transition-all duration-200 ${
                              hasAMC === true
                                ? 'border-black bg-black text-white shadow-md'
                                : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50'
                            }`}
                          >
                            <div className="flex flex-col items-center gap-2">
                              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                                hasAMC === true
                                  ? 'border-white bg-white'
                                  : 'border-gray-400'
                              }`}>
                                {hasAMC === true && (
                                  <div className="w-2.5 h-2.5 rounded-full bg-black"></div>
                                )}
                              </div>
                              <span className="font-medium text-sm">Yes</span>
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setHasAMC(false);
                              // Auto-advance to next step if No
                              setCompleteJobStep(4);
                            }}
                            className={`p-4 rounded-lg border-2 transition-all duration-200 ${
                              hasAMC === false
                                ? 'border-black bg-black text-white shadow-md'
                                : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50'
                            }`}
                          >
                            <div className="flex flex-col items-center gap-2">
                              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                                hasAMC === false
                                  ? 'border-white bg-white'
                                  : 'border-gray-400'
                              }`}>
                                {hasAMC === false && (
                                  <div className="w-2.5 h-2.5 rounded-full bg-black"></div>
                                )}
                              </div>
                              <span className="font-medium text-sm">No</span>
                            </div>
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                            <Label htmlFor="amc-start-date" className="text-sm font-medium">AMC Start Date <span className="text-red-600">*</span></Label>
                            <DatePicker
                              value={amcDateGiven || undefined}
                              onChange={(date) => {
                                if (date) {
                                  setAmcDateGiven(date);
                                  if (amcYears > 0) {
                                    const endDate = new Date(date + 'T12:00:00');
                                    endDate.setFullYear(endDate.getFullYear() + amcYears);
                                    endDate.setDate(endDate.getDate() - 1);
                                    setAmcEndDate(endDate.toISOString().split('T')[0]);
                                  } else {
                                    setAmcEndDate('');
                                  }
                                }
                              }}
                              placeholder="Pick date"
                              className="mt-1 h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm font-normal"
                            />
                      </div>
                      <div>
                        <Label htmlFor="amc-years" className="text-sm font-medium">Number of Years <span className="text-red-600">*</span></Label>
                        <Select
                          value={amcYears > 0 ? amcYears.toString() : ''}
                          onValueChange={(value) => {
                            const years = value ? parseInt(value) : 0;
                            setAmcYears(years);
                            if (years === 0) {
                              setHasAMC(false);
                              setAmcEndDate('');
                            } else {
                              setHasAMC(true);
                              if (amcDateGiven && years > 0) {
                                const endDate = new Date(amcDateGiven);
                                endDate.setFullYear(endDate.getFullYear() + years);
                                endDate.setDate(endDate.getDate() - 1);
                                setAmcEndDate(endDate.toISOString().split('T')[0]);
                              }
                            }
                          }}
                        >
                          <SelectTrigger id="amc-years" className="mt-1 h-10 w-full rounded-md border border-input">
                            <SelectValue placeholder="Select years" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">1 Year</SelectItem>
                            <SelectItem value="2">2 Years</SelectItem>
                            <SelectItem value="3">3 Years</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="amc-amount" className="text-sm font-medium">AMC Amount <span className="text-red-600">*</span></Label>
                      <Input
                        id="amc-amount"
                        type="number"
                        placeholder="Enter AMC amount"
                        value={amcAmount}
                        onChange={(e) => {
                          setAmcAmount(e.target.value);
                      }}
                      className="mt-1 h-10 w-full rounded-md border border-input"
                      min="0"
                      step="0.01"
                    />
                  </div>

                  <div>
                      <Label className="text-sm font-medium mb-2 block">Includes Prefilter <span className="text-red-600">*</span></Label>
                      <p className="text-xs text-gray-500 mb-2">Customer&apos;s AMC includes prefilter maintenance</p>
                      <div className="grid grid-cols-2 gap-4">
                        <button
                          type="button"
                          onClick={() => setAmcIncludesPrefilter(true)}
                          className={`p-4 rounded-lg border-2 transition-all duration-200 ${
                            amcIncludesPrefilter === true
                              ? 'border-black bg-black text-white shadow-md'
                              : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50'
                          }`}
                        >
                          <span className="font-medium text-sm">Yes</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setAmcIncludesPrefilter(false)}
                          className={`p-4 rounded-lg border-2 transition-all duration-200 ${
                            amcIncludesPrefilter === false
                              ? 'border-black bg-black text-white shadow-md'
                              : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50'
                          }`}
                        >
                          <span className="font-medium text-sm">No</span>
                        </button>
                      </div>
                    </div>

                    <div>
                      <Label className="text-sm font-medium">AMC service period (auto job creation) <span className="text-red-600">*</span></Label>
                      <Select
                        value={amcServicePeriodKind || undefined}
                        onValueChange={(v: string) => setAmcServicePeriodKind(v === '' ? '' : (v as '4' | '6' | 'custom' | 'no_auto'))}
                      >
                        <SelectTrigger className="mt-1 h-10 w-full rounded-md border border-input">
                          <SelectValue placeholder="Select period" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="6">Every 6 months</SelectItem>
                          <SelectItem value="custom">Custom (months)</SelectItem>
                          <SelectItem value="no_auto">No auto</SelectItem>
                        </SelectContent>
                      </Select>
                      {amcServicePeriodKind === 'custom' && (
                        <Input
                          type="number"
                          min={1}
                          max={24}
                          value={amcServicePeriodCustomMonths}
                          onChange={(e) => setAmcServicePeriodCustomMonths(Math.max(1, parseInt(e.target.value, 10) || 1))}
                          className="mt-1 h-10 w-full rounded-md border border-input"
                          placeholder="Months"
                        />
                      )}
                    </div>

                    <div>
                      <Label htmlFor="amc-additional-info" className="text-sm font-medium">Additional Information (Reference Only)</Label>
                <Textarea
                        id="amc-additional-info"
                        value={amcAdditionalInfo}
                  onChange={(e) => {
                          setAmcAdditionalInfo(e.target.value);
                        }}
                        placeholder="Enter any additional AMC information for admin reference (optional)..."
                        rows={4}
                      className="mt-1 w-full rounded-md border border-input min-h-[80px]"
                />
                      <p className="text-xs text-gray-500 mt-1">
                        Saved for admin reference only — not included on the customer AMC PDF.
                      </p>
              </div>

                      {technicianReferenceAmcBill && serviceBrand ? (
                        <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-4 space-y-3">
                          <div>
                            <p className="text-sm font-semibold text-violet-950">Share AMC with customer</p>
                            <p className="text-xs text-violet-900/75 mt-1 leading-relaxed">
                              Send the AMC PDF on WhatsApp. Change the number if needed, or add a
                              second number.
                            </p>
                          </div>
                          <AmcDocumentActions
                            compact
                            bill={technicianReferenceAmcBill}
                            brand={normalizeDocumentBrand(serviceBrand) || 'hydrogenro'}
                            endDateIso={amcEndDate}
                            customerEmail={completeJobCustomerDoc?.email}
                            onSaveCustomerEmail={saveCustomerEmailForAmc}
                            onPersistBeforeAction={() =>
                              persistTechnicianAmcForShare({ sharedVia: 'technician_download' })
                            }
                            onPersistAfterEmail={(recipients) =>
                              persistTechnicianAmcForShare({
                                sharedVia: 'technician_email',
                                emailedTo: recipients,
                                customerEmailOverride: recipients[0],
                              })
                            }
                            pdfOptions={{
                              includeDetails: true,
                              showComputerGeneratedText: true,
                            }}
                          />
                        </div>
                      ) : null}
                      </div>
                    </>
                  )}
            </div>
              )}

              {/* Step 4: Payment Mode - only show if bill amount is not zero */}
              {completeJobStep === 4 && !isBillAmountZero() && (
                <div className="space-y-4">
                  <div>
                      <Label htmlFor="payment-mode">Payment Mode *</Label>
                      <Select 
                        value={paymentMode} 
                        onValueChange={(value: 'CASH' | 'ONLINE' | 'PARTIAL' | 'PENDING_PAYMENT') => {
                          setPaymentMode(value);
                          if (value === 'CASH') {
                            setQrCodeType('');
                            setSelectedQrCodeId('');
                            setShareLinkUpiQrId('');
                            setPaymentScreenshot('');
                          }
                          if (value === 'PARTIAL') {
                            setPartialCashAmount('');
                            setPartialOnlineAmount('');
                          }
                          if (value === 'PENDING_PAYMENT') {
                            setPendingPaidTodayEnabled(false);
                            setPendingPaidTodayMode('');
                            setPendingPaidTodayAmount('');
                            setPartialCashAmount('');
                            setPartialOnlineAmount('');
                            setPromisedPaymentDate('');
                            setQrCodeType('');
                            setSelectedQrCodeId('');
                            setShareLinkUpiQrId('');
                          } else {
                            setPendingPaidTodayEnabled(false);
                            setPendingPaidTodayMode('');
                            setPendingPaidTodayAmount('');
                          }
                        }}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Select payment mode" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="CASH">Cash</SelectItem>
                          <SelectItem value="ONLINE">Online</SelectItem>
                          <SelectItem value="PARTIAL">Partial (Cash + Online)</SelectItem>
                          <SelectItem value="PENDING_PAYMENT">Pending Payment</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                  {paymentMode === 'PENDING_PAYMENT' && (
                    <PendingPaymentFields
                      billAmount={parseMoneyAmount(billAmount) || 0}
                      paidTodayEnabled={pendingPaidTodayEnabled}
                      onPaidTodayEnabledChange={setPendingPaidTodayEnabled}
                      paidTodayMode={pendingPaidTodayMode}
                      onPaidTodayModeChange={setPendingPaidTodayMode}
                      paidTodayAmount={pendingPaidTodayAmount}
                      onPaidTodayAmountChange={setPendingPaidTodayAmount}
                      partialCashAmount={partialCashAmount}
                      onPartialCashAmountChange={setPartialCashAmount}
                      partialOnlineAmount={partialOnlineAmount}
                      onPartialOnlineAmountChange={setPartialOnlineAmount}
                      promisedDate={promisedPaymentDate}
                      onPromisedDateChange={setPromisedPaymentDate}
                      sanitizeMoneyInput={sanitizeMoneyInput}
                      parseMoneyAmount={parseMoneyAmount}
                    />
                  )}

                  {(paymentMode === 'PARTIAL') && (
                    <div className="space-y-3 pl-4 border-l-2 border-gray-200">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label htmlFor="partial-cash">Cash amount (₹)</Label>
                          <Input
                            id="partial-cash"
                            type="text"
                            inputMode="decimal"
                            placeholder="0"
                            value={partialCashAmount}
                            onChange={(e) => {
                              const v = sanitizeMoneyInput(e.target.value);
                              setPartialCashAmount(v);
                              const bill = parseMoneyAmount(billAmount);
                              const cash = parseMoneyAmount(v);
                              if (v !== '' && Number.isFinite(cash) && Number.isFinite(bill)) {
                                const online = Math.max(0, Math.round((bill - cash) * 100) / 100);
                                setPartialOnlineAmount(online === Math.floor(online) ? String(Math.floor(online)) : online.toFixed(2));
                              }
                            }}
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label htmlFor="partial-online">Online amount (₹)</Label>
                          <Input
                            id="partial-online"
                            type="text"
                            inputMode="decimal"
                            placeholder="0"
                            value={partialOnlineAmount}
                            onChange={(e) => {
                              const v = sanitizeMoneyInput(e.target.value);
                              setPartialOnlineAmount(v);
                              const bill = parseMoneyAmount(billAmount);
                              const online = parseMoneyAmount(v);
                              if (v !== '' && Number.isFinite(online) && Number.isFinite(bill)) {
                                const cash = Math.max(0, Math.round((bill - online) * 100) / 100);
                                setPartialCashAmount(cash === Math.floor(cash) ? String(Math.floor(cash)) : cash.toFixed(2));
                              }
                            }}
                            className="mt-1"
                          />
                        </div>
                      </div>
                      {(() => {
                        const bill = parseMoneyAmount(billAmount);
                        const cash = parseMoneyAmount(partialCashAmount);
                        const online = parseMoneyAmount(partialOnlineAmount);
                        // Only warn once both inputs have something usable —
                        // the auto-fill keeps them in sync most of the time.
                        if (!Number.isFinite(bill) || bill <= 0) return null;
                        if (!Number.isFinite(cash) && !Number.isFinite(online)) return null;
                        const sum = (Number.isFinite(cash) ? cash : 0) + (Number.isFinite(online) ? online : 0);
                        if (Math.abs(sum - bill) <= 0.01) return null;
                        return (
                          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                            Cash + Online = ₹{sum.toFixed(2)}, but bill is ₹{bill.toFixed(2)}.
                            Adjust the amounts so they match the bill.
                          </p>
                        );
                      })()}
                    </div>
                  )}
                  
                  {(paymentMode === 'ONLINE' ||
                    paymentMode === 'PARTIAL' ||
                    (paymentMode === 'PENDING_PAYMENT' &&
                      pendingPaidTodayEnabled &&
                      (pendingPaidTodayMode === 'ONLINE' ||
                        (pendingPaidTodayMode === 'PARTIAL' &&
                          parseMoneyAmount(partialOnlineAmount) > 0)))) && (
                    <div className="space-y-4 pl-4 border-l-2 border-gray-200">
                      <div>
                        <Label htmlFor="qr-code-type">Select QR Code *</Label>
                        <Select 
                          value={selectedQrCodeId} 
                          onValueChange={(value) => {
                            setSelectedQrCodeId(value);
                            let qrType = '';
                            let qrUrl = '';
                            let qrName = '';

                            if (value === SHARE_QR_LINK_VALUE) {
                              qrType = 'share_link';
                              setShareLinkUpiQrId('');
                            } else if (value.startsWith('common_')) {
                              setShareLinkUpiQrId('');
                              qrType = 'common';
                              const qrId = value.replace('common_', '');
                              const selectedQr =
                                commonQrCodes.find(qr => qr.id === qrId) ||
                                allCommonQrCodes.find(qr => qr.id === qrId) ||
                                commonQrCodesForTechnician.find(qr => qr.id === qrId);
                              if (selectedQr) {
                                qrUrl = selectedQr.qrCodeUrl;
                                qrName = selectedQr.name;
                              }
                            } else if (value.startsWith('technician_')) {
                              setShareLinkUpiQrId('');
                              qrType = 'technician';
                              const techId = value.replace('technician_', '');
                              const selectedTech =
                                technicians.find(t => t.id === techId) ||
                                allTechnicians.find(t => t.id === techId);
                              if (selectedTech) {
                                qrUrl = String((selectedTech as any).qrCode || '');
                                qrName = (selectedTech as any).fullName || 'Technician';
                              }
                            }

                            setQrCodeType(qrType);
                            setSelectedQrCodeName(qrName);
                            setSelectedQrCodeUrlState(qrUrl);
                          }}
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue placeholder="Select QR code" />
                          </SelectTrigger>
                          <SelectContent className="!z-[100]">
                            {/* Common QR Codes - show by name */}
                            {commonQrCodes.length === 0 &&
                            technicians.filter((t) => technicianHasPaymentQr(t as any)).length ===
                              0 ? (
                              <SelectItem value="no-qr" disabled>
                                No QR codes available
                              </SelectItem>
                            ) : (
                              <>
                                {/* Common QR Codes Section */}
                                {commonQrCodes.length > 0 && (
                                  <>
                            {commonQrCodes.map((qr) => (
                              <SelectItem key={`common_${qr.id}`} value={`common_${qr.id}`}>
                                {qr.name}
                              </SelectItem>
                            ))}
                                  </>
                                )}
                                
                                {/* Technician QR Codes Section */}
                                {technicians
                                  .filter((t) => technicianHasPaymentQr(t as any))
                                  .map((tech) => (
                                    <SelectItem key={`technician_${tech.id}`} value={`technician_${tech.id}`}>
                                      {tech.fullName}'s QR Code
                            </SelectItem>
                                  ))}
                                {whatsappCloudApiOn ? (
                                <SelectItem value={SHARE_QR_LINK_VALUE}>
                                  Send pay QR on WhatsApp (customer not on site)
                                </SelectItem>
                                ) : null}
                              </>
                            )}
                          </SelectContent>
                        </Select>
                      </div>

                      {selectedQrCodeId === SHARE_QR_LINK_VALUE ? (
                        <ShareQrLinkPanel
                          commonQrCodes={
                            commonQrCodes.length > 0 ? commonQrCodes : allCommonQrCodes
                          }
                          technicians={
                            (technicians.length > 0
                              ? technicians
                              : allTechnicians) as TechnicianQrPickerRow[]
                          }
                          selectedUpiQrId={shareLinkUpiQrId}
                          onSelectUpiQrId={(id) => {
                            setShareLinkUpiQrId(id);
                            if (id.startsWith('technician_')) {
                              const techId = id.replace('technician_', '');
                              const selectedTech =
                                technicians.find((t) => t.id === techId) ||
                                allTechnicians.find((t) => t.id === techId);
                              if (selectedTech) {
                                setQrCodeType('technician');
                                setSelectedQrCodeName(
                                  `${(selectedTech as any).fullName || 'Technician'}'s QR`
                                );
                                setSelectedQrCodeUrlState(
                                  String((selectedTech as any).qrCode || '')
                                );
                              }
                              return;
                            }
                            const bareId = id.startsWith('common_')
                              ? id.replace('common_', '')
                              : id;
                            const selectedQr =
                              commonQrCodes.find((qr) => qr.id === bareId) ||
                              allCommonQrCodes.find((qr) => qr.id === bareId);
                            if (selectedQr) {
                              setQrCodeType('common');
                              setSelectedQrCodeName(selectedQr.name);
                              setSelectedQrCodeUrlState(selectedQr.qrCodeUrl || '');
                            }
                          }}
                          amount={(() => {
                            if (
                              paymentMode === 'PARTIAL' ||
                              (paymentMode === 'PENDING_PAYMENT' &&
                                pendingPaidTodayMode === 'PARTIAL')
                            ) {
                              return parseMoneyAmount(partialOnlineAmount) || 0;
                            }
                            if (
                              paymentMode === 'PENDING_PAYMENT' &&
                              pendingPaidTodayMode === 'ONLINE'
                            ) {
                              const paid = parseMoneyAmount(pendingPaidTodayAmount);
                              return Number.isFinite(paid) && paid > 0
                                ? paid
                                : parseMoneyAmount(billAmount) || 0;
                            }
                            return parseMoneyAmount(billAmount) || 0;
                          })()}
                          brand={normalizeDocumentBrand(serviceBrand) || 'hydrogenro'}
                          customerPhone={
                            (selectedJobForComplete?.customer as { phone?: string } | undefined)
                              ?.phone ||
                            completeJobCustomerDoc?.phone ||
                            (selectedJobForComplete?.customer as { alternatePhone?: string; alternate_phone?: string } | undefined)
                              ?.alternatePhone ||
                            (selectedJobForComplete?.customer as { alternate_phone?: string } | undefined)
                              ?.alternate_phone ||
                            (selectedJobForComplete as { customerPhone?: string } | null)
                              ?.customerPhone ||
                            ''
                          }
                          customerName={
                            selectedJobForComplete?.customerName ||
                            (selectedJobForComplete?.customer as { fullName?: string; full_name?: string } | undefined)
                              ?.fullName ||
                            (selectedJobForComplete?.customer as { full_name?: string } | undefined)
                              ?.full_name ||
                            completeJobCustomerDoc?.fullName ||
                            ''
                          }
                          note={
                            selectedJobForComplete?.customerName ||
                            selectedJobForComplete?.jobNumber ||
                            ''
                          }
                          jobId={selectedJobForComplete?.id || null}
                          customerId={
                            completeJobCustomerDoc?.id ||
                            (selectedJobForComplete as { customerId?: string } | null)?.customerId ||
                            null
                          }
                          jobRef={
                            selectedJobForComplete?.jobNumber ||
                            selectedJobForComplete?.customerName ||
                            null
                          }
                        />
                      ) : null}

                      {/* Display selected QR code image immediately */}
                      {selectedQrCodeId && selectedQrCodeId !== SHARE_QR_LINK_VALUE && (
                        <div className="mt-4 p-4 bg-primary/10 border border-primary rounded-lg">
                          <p className="text-sm font-semibold text-primary mb-3 text-center">
                            QR Code - Show to Customer
                          </p>
                          <div className="flex justify-center">
                            {selectedQrCodeId.startsWith('common_') ? (() => {
                              const qrId = selectedQrCodeId.replace('common_', '');
                              const selectedQr =
                                commonQrCodes.find(qr => qr.id === qrId) ||
                                allCommonQrCodes.find(qr => qr.id === qrId) ||
                                commonQrCodesForTechnician.find(qr => qr.id === qrId);
                              if (!selectedQr) {
                                return (
                                  <div className="text-center p-4">
                                    <p className="text-sm text-red-500">QR code not found</p>
                                  </div>
                                );
                              }
                              const onlineAmt = (() => {
                                if (
                                  paymentMode === 'PARTIAL' ||
                                  (paymentMode === 'PENDING_PAYMENT' &&
                                    pendingPaidTodayMode === 'PARTIAL')
                                ) {
                                  return parseMoneyAmount(partialOnlineAmount);
                                }
                                if (
                                  paymentMode === 'PENDING_PAYMENT' &&
                                  pendingPaidTodayMode === 'ONLINE'
                                ) {
                                  const paid = parseMoneyAmount(pendingPaidTodayAmount);
                                  return Number.isFinite(paid) && paid > 0
                                    ? paid
                                    : parseMoneyAmount(billAmount);
                                }
                                return parseMoneyAmount(billAmount);
                              })();
                              if (isDynamicUpiQr(selectedQr)) {
                                return (
                                  <DynamicUpiQrDisplay
                                    upiId={selectedQr.upiId || ''}
                                    payeeName={selectedQr.payeeName || selectedQr.name}
                                    amount={onlineAmt}
                                    note={selectedJobForComplete?.customerName || selectedQr.name}
                                    phone={selectedQr.phone}
                                    label={selectedQr.name}
                                    fallbackImageUrl={selectedQr.qrCodeUrl}
                                  />
                                );
                              }
                              if (!selectedQr.qrCodeUrl) {
                                return (
                                  <div className="text-center p-4">
                                    <p className="text-sm text-red-500">No QR image — enable Dynamic UPI or upload an image in Settings</p>
                                  </div>
                                );
                              }
                              return (
                                <div className="text-center">
                                  <p className="text-sm font-medium mb-3 text-gray-700">{selectedQr.name}</p>
                                  <img 
                                    src={appendQrCacheBust(selectedQr.qrCodeUrl, qrAssetsVersion)} 
                                    alt={selectedQr.name}
                                    className="w-64 h-64 object-contain mx-auto border-2 border-primary rounded-lg shadow-lg bg-white p-3"
                                    onError={(e) => {
                                      console.error('Failed to load QR code:', selectedQr.qrCodeUrl);
                                    }}
                    />
                  </div>
                              );
                            })() : selectedQrCodeId.startsWith('technician_') ? (() => {
                              const techId = selectedQrCodeId.replace('technician_', '');
                              const selectedTech =
                                technicians.find((t) => t.id === techId) ||
                                allTechnicians.find((t) => t.id === techId);
                              if (!selectedTech || !technicianHasPaymentQr(selectedTech as any)) {
                                return (
                                  <div className="text-center p-4">
                                    <p className="text-sm text-red-500">QR code not found</p>
                                    <p className="text-xs text-gray-500 mt-1">Technician QR code not available</p>
                                  </div>
                                );
                              }
                              const onlineAmt = (() => {
                                if (
                                  paymentMode === 'PARTIAL' ||
                                  (paymentMode === 'PENDING_PAYMENT' &&
                                    pendingPaidTodayMode === 'PARTIAL')
                                ) {
                                  return parseMoneyAmount(partialOnlineAmount);
                                }
                                if (
                                  paymentMode === 'PENDING_PAYMENT' &&
                                  pendingPaidTodayMode === 'ONLINE'
                                ) {
                                  const paid = parseMoneyAmount(pendingPaidTodayAmount);
                                  return Number.isFinite(paid) && paid > 0
                                    ? paid
                                    : parseMoneyAmount(billAmount);
                                }
                                return parseMoneyAmount(billAmount);
                              })();
                              if (isDynamicUpiTechnician(selectedTech as any)) {
                                return (
                                  <DynamicUpiQrDisplay
                                    upiId={(selectedTech as any).upiId || ''}
                                    payeeName={
                                      (selectedTech as any).payeeName || selectedTech.fullName
                                    }
                                    amount={onlineAmt}
                                    note={
                                      selectedJobForComplete?.customerName || selectedTech.fullName
                                    }
                                    phone={(selectedTech as any).upiPhone}
                                    label={`${selectedTech.fullName}'s QR`}
                                    fallbackImageUrl={(selectedTech as any).qrCode}
                                  />
                                );
                              }
                              return (
                                <div className="text-center">
                                  <p className="text-sm font-medium mb-3 text-gray-700">
                                    {selectedTech.fullName}'s QR Code
                                  </p>
                                  <img 
                                    src={appendQrCacheBust(String((selectedTech as any).qrCode || ''), qrAssetsVersion)} 
                                    alt={`${selectedTech.fullName}'s QR Code`}
                                    className="w-64 h-64 object-contain mx-auto border-2 border-primary rounded-lg shadow-lg bg-white p-3"
                                    onError={(e) => {
                                      console.error('Failed to load technician QR code:', (selectedTech as any).qrCode);
                                    }}
                                  />
                                </div>
                              );
                            })() : null}
                                </div>
                        </div>
                    )}

                      {/* Payment QR only for Online/Partial; non-payment Common QRs not shown here */}
                  </div>
                )}
                      </div>
                    )}

              {/* Step 5: Payment Screenshot (optional) - only show if bill amount is not zero */}
              {completeJobStep === 5 && !isBillAmountZero() && (
                <CompletionPhotoStep
                  label="Payment screenshot (optional)"
                  hint={
                    paymentMode === 'ONLINE'
                      ? 'UPI or bank payment confirmation, if available.'
                      : 'Payment proof screenshot, if available.'
                  }
                  images={paymentScreenshot ? [paymentScreenshot] : []}
                  onImagesChange={(images) => setPaymentScreenshot(images[0] || '')}
                  onUploadStateChange={setIsPaymentScreenshotUploading}
                  maxImages={1}
                  folder="payment-receipts"
                  jobId={selectedJobForComplete?.id}
                  photoType="payment"
                  maxWidth={800}
                  quality={0.3}
                  useSecondaryAccount
                />
              )}

              {/* Step 7: OTP Verification */}
              {completeJobStep === 7 && needsOtpStep() && (
                <div className="space-y-4">
                  <div>
                    <Label>Enter 4-Digit OTP *</Label>
                    <p className="text-sm text-gray-500 mb-4">
                      Please enter the 4-digit OTP to verify job completion
                    </p>
                    <div className="flex justify-center gap-3">
                      {[0, 1, 2, 3].map((index) => (
                        <Input
                          key={index}
                          ref={(el) => {
                            otpInputRefs.current[index] = el;
                          }}
                          type="text"
                          inputMode="numeric"
                          maxLength={1}
                          value={otpInput[index]}
                          onChange={(e) => {
                            const value = e.target.value.replace(/\D/g, ''); // Only allow digits
                            if (value.length <= 1) {
                              const newOtp = [...otpInput];
                              newOtp[index] = value;
                              setOtpInput(newOtp);
                              setOtpError(''); // Clear error when user types
                              
                              // Auto-focus next box if value entered
                              if (value && index < 3) {
                                otpInputRefs.current[index + 1]?.focus();
                              }
                            }
                          }}
                          onKeyDown={(e) => {
                            // Handle backspace to go to previous box
                            if (e.key === 'Backspace' && !otpInput[index] && index > 0) {
                              otpInputRefs.current[index - 1]?.focus();
                            }
                          }}
                          onPaste={(e) => {
                            e.preventDefault();
                            const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
                            if (pastedData.length > 0) {
                              const newOtp = ['', '', '', ''];
                              for (let i = 0; i < pastedData.length && i < 4; i++) {
                                newOtp[i] = pastedData[i];
                              }
                              setOtpInput(newOtp);
                              setOtpError('');
                              // Focus the next empty box or the last box
                              const nextIndex = Math.min(pastedData.length, 3);
                              otpInputRefs.current[nextIndex]?.focus();
                            }
                          }}
                          className="w-14 h-14 text-center text-2xl font-mono border-2 focus:border-black"
                          autoFocus={index === 0}
                        />
                      ))}
                    </div>
                    {otpError && (
                      <p className="text-sm text-red-500 mt-2 text-center">{otpError}</p>
                    )}
                    <p className="text-xs text-gray-500 mt-2 text-center">
                      Ask the customer for their 4-digit code
                    </p>
                  </div>
                </div>
              )}

              {/* Step 6: Prefilter Question (RO) or final step (softener) */}
              {completeJobStep === 6 && (
                <div className="rounded-xl border border-blue-200 bg-blue-50/80 dark:bg-blue-950/30 dark:border-blue-800 p-3 sm:p-4 mb-4">
                  <p className="text-sm text-blue-900 dark:text-blue-100">
                    <span className="font-medium">Reminder:</span> Please affix the sticker on the machine and capture any photos if needed before completing.
                  </p>
                </div>
              )}
              {completeJobStep === 6 && isSoftenerService() && (
                <div className="space-y-4">
                  <p className="text-sm text-center text-gray-600">Review the options below, then complete the job.</p>
                  <CompletionFinishSection
                    job={selectedJobForComplete}
                    extraPhotos={extraPhotosStep6}
                    onExtraPhotosChange={setExtraPhotosStep6}
                    onUploadStateChange={setIsExtraPhotosStep6Uploading}
                    onSetReminder={openCompletionSetReminder}
                    onUpdateCustomerInfo={() => {
                      if (selectedJobForComplete) openCustomerUpdateDialog(selectedJobForComplete);
                    }}
                    dontSendMessage={dontSendMessageToCustomer}
                    onDontSendMessageChange={setDontSendMessageToCustomer}
                    askForReview={askForReview}
                    onAskForReviewChange={setAskForReview}
                  />
                </div>
              )}
              {completeJobStep === 6 && !isSoftenerService() && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4 space-y-4">
                    <div className="space-y-3">
                      <Label className="text-sm font-semibold text-gray-900">Does the customer have a prefilter?</Label>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => setCustomerHasPrefilter(true)}
                          className={`rounded-lg border-2 p-3 text-sm font-medium transition-all ${
                            customerHasPrefilter === true
                              ? 'border-black bg-black text-white shadow-sm'
                              : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                          }`}
                        >
                          Yes
                        </button>
                        <button
                          type="button"
                          onClick={() => setCustomerHasPrefilter(false)}
                          className={`rounded-lg border-2 p-3 text-sm font-medium transition-all ${
                            customerHasPrefilter === false
                              ? 'border-black bg-black text-white shadow-sm'
                              : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                          }`}
                        >
                          No
                        </button>
                      </div>
                    </div>
                    <div className="space-y-2 pt-1 border-t border-gray-100">
                      <Label htmlFor="raw-water-tds" className="text-sm font-semibold text-gray-900">
                        Raw water TDS (ppm) <span className="text-red-600">*</span>
                      </Label>
                      <Input
                        id="raw-water-tds"
                        type="text"
                        inputMode="numeric"
                        placeholder="e.g. 500"
                        value={rawWaterTds}
                        onChange={(e) => setRawWaterTds(e.target.value.replace(/\D/g, '').slice(0, 4))}
                        className="max-w-[160px] h-11"
                        required
                      />
                    </div>
                  </div>
                  <CompletionFinishSection
                    job={selectedJobForComplete}
                    extraPhotos={extraPhotosStep6}
                    onExtraPhotosChange={setExtraPhotosStep6}
                    onUploadStateChange={setIsExtraPhotosStep6Uploading}
                    onSetReminder={openCompletionSetReminder}
                    onUpdateCustomerInfo={() => {
                      if (selectedJobForComplete) openCustomerUpdateDialog(selectedJobForComplete);
                    }}
                    dontSendMessage={dontSendMessageToCustomer}
                    onDontSendMessageChange={setDontSendMessageToCustomer}
                    askForReview={askForReview}
                    onAskForReviewChange={setAskForReview}
                  />
                </div>
              )}

            </div>

            <DialogFooter className="px-6 py-4 flex-shrink-0 border-t">
              <Button
                variant="outline"
                disabled={isSubmittingJobCompletion}
                onClick={() => {
                  if (isSubmittingJobCompletion) return;
                  if (completeJobStep > 1) {
                    // If we're in Phase-B-retry mode, going Back means the
                    // technician wants to fix something. Clear retry mode so a
                    // subsequent Submit re-runs Phase A + B with the edited
                    // data instead of silently flipping status with the old
                    // server-side payload (#4).
                    if (completionRetryPhaseBOnly) {
                      setCompletionRetryPhaseBOnly(false);
                      setCompletionSubmitError(null);
                    }
                    setCompleteJobStep((prev) => {
                      // If going back from step 6 and OTP is required, go to step 7, not step 5
                      if (prev === 6 && needsOtpStep()) {
                        return 7;
                      }
                      // If going back from step 7, go to step 5
                      if (prev === 7) {
                        return 5;
                      }
                      return (prev - 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
                    });
                    setOtpError(''); // Clear OTP error when going back
                    if (completeJobStep === 7) {
                      setOtpInput(['', '', '', '']); // Reset OTP when going back
                    }
                  } else {
                    const draft = captureCompleteJobDraft();
                    if (draft) writeTechnicianCompleteJobDraft(draft);
                    setCompleteDialogOpen(false);
                    setSelectedJobForComplete(null);
                    resetCompleteJobFormState();
                  }
                }}
              >
                {completeJobStep > 1 ? 'Back' : 'Cancel'}
              </Button>
              {completeJobStep === 2 && (
                <Button
                  variant="outline"
                  disabled={
                    isSubmittingJobCompletion ||
                    isBillPhotosUploading ||
                    billPhotos.some(hasPendingLocalOrUploadingPhoto)
                  }
                  onClick={() => {
                    if (!selectedJobForComplete) return;
                    if (isSubmittingJobCompletion) return;
                    if (isBillPhotosUploading || billPhotos.some(hasPendingLocalOrUploadingPhoto)) return;
                    setBillPhotosSkipConfirmOpen(true);
                  }}
                >
                  Skip
                </Button>
              )}
              {/* Skip button for step 3 - only show if step 3 is visible (not skipped) */}
              {completeJobStep === 3 && !isBillAmountZero() && !isSoftenerService() && (
                <Button
                  variant="outline"
                  disabled={isSubmittingJobCompletion}
                  onClick={() => {
                    if (isSubmittingJobCompletion) return;
                    // Skip AMC step - go to payment step (step 4)
                    setCompleteJobStep(4);
                  }}
                >
                  Skip
                </Button>
              )}
              {completionSubmitError && (
                <Button
                  variant="outline"
                  className="border-red-300 text-red-700 hover:bg-red-50"
                  disabled={isSubmittingJobCompletion}
                  onClick={() => {
                    if (completeJobStep !== 6) setCompleteJobStep(6);
                    void handleCompleteJobSubmit();
                  }}
                >
                  {completionRetryPhaseBOnly ? 'Retry finish' : 'Retry'}
                </Button>
              )}
              <Button
                onClick={handleCompleteJobSubmit}
                className="bg-black hover:bg-gray-800 !text-white font-semibold"
                disabled={
                  isSubmittingJobCompletion ||
                  completeJobNextDisabledByUploads ||
                  (completeJobStep === 1 && !serviceBrand) ||
                  // #6 Bill amount required on step 1 — must be a valid number
                  // (NaN-safe) so junk like "abc" can't slip through.
                  (completeJobStep === 1 && billAmount.trim() !== '' && !Number.isFinite(parseMoneyAmount(billAmount))) ||
                  (isCompleteJobFooterSubmit() && hasAnyPendingCompletionUploads() && !completionRetryPhaseBOnly) ||
                  (completeJobStep === 6 && !isSoftenerService() && !rawWaterTds.trim() && !completionRetryPhaseBOnly) ||
                  (completeJobStep === 4 && !isBillAmountZero() && !paymentMode) ||
                  (completeJobStep === 4 && !isBillAmountZero() && (paymentMode === 'ONLINE' || paymentMode === 'PARTIAL') && (paymentMode === 'ONLINE' ? !resolveEffectiveQrCodeId(selectedQrCodeId, shareLinkUpiQrId) : (parseMoneyAmount(partialOnlineAmount) > 0 && !resolveEffectiveQrCodeId(selectedQrCodeId, shareLinkUpiQrId)))) ||
                  (completeJobStep === 4 &&
                    !isBillAmountZero() &&
                    paymentMode === 'PENDING_PAYMENT' &&
                    (!promisedPaymentDate ||
                      (pendingPaidTodayEnabled &&
                        (!pendingPaidTodayMode ||
                          (pendingPaidTodayMode === 'PARTIAL'
                            ? !(parseMoneyAmount(partialCashAmount) > 0 && parseMoneyAmount(partialOnlineAmount) > 0)
                            : !(parseMoneyAmount(pendingPaidTodayAmount) > 0)) ||
                          ((pendingPaidTodayMode === 'ONLINE' ||
                            (pendingPaidTodayMode === 'PARTIAL' &&
                              parseMoneyAmount(partialOnlineAmount) > 0)) &&
                            !resolveEffectiveQrCodeId(selectedQrCodeId, shareLinkUpiQrId)))))) ||
                  // #6 Block Next on step 4 when partial cash + online don't
                  // add up to the bill (allowing 0.01 for rounding).
                  (completeJobStep === 4 && !isBillAmountZero() && paymentMode === 'PARTIAL' && (() => {
                    const bill = parseMoneyAmount(billAmount);
                    const cash = parseMoneyAmount(partialCashAmount);
                    const online = parseMoneyAmount(partialOnlineAmount);
                    if (!Number.isFinite(bill) || bill <= 0) return false;
                    const sum = (Number.isFinite(cash) ? cash : 0) + (Number.isFinite(online) ? online : 0);
                    return Math.abs(sum - bill) > 0.01;
                  })()) ||
                  (completeJobStep === 7 && otpInput.join('').length !== 4)
                }
              >
                {isSubmittingJobCompletion ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Submitting…
                  </>
                ) : isCompleteJobFooterSubmit() ? (
                  completionRetryPhaseBOnly ? 'Retry finish' : 'Complete Job'
                ) : (
                  'Next'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Phone Numbers Dialog */}
        <Dialog open={phonePopupOpen} onOpenChange={setPhonePopupOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Phone className="w-5 h-5 text-blue-600" />
                Contact Numbers
              </DialogTitle>
              <DialogDescription asChild>
                <span>
                  Choose a phone number to call for{' '}
                  <span
                    className={customerNameClassName({
                      full_name: selectedCustomerPhone?.full_name,
                      customer_tier: selectedCustomerPhone?.customer_tier,
                    } as any)}
                  >
                    {selectedCustomerPhone?.full_name || 'customer'}
                  </span>
                </span>
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {/* Primary Phone */}
              {selectedCustomerPhone?.phone && (
                <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <div>
                    <div className="font-semibold text-gray-900">{selectedCustomerPhone.phone}</div>
                    <div className="text-sm text-blue-600 font-medium">Primary Number</div>
      </div>
                  <a 
                    href={`tel:${selectedCustomerPhone.phone}`}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                  >
                    Call
                  </a>
                </div>
              )}
              
              {/* Secondary Phone */}
              {selectedCustomerPhone?.alternate_phone && (
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div>
                    <div className="font-semibold text-gray-900">{selectedCustomerPhone.alternate_phone}</div>
                    <div className="text-sm text-gray-600 font-medium">Secondary Number</div>
                  </div>
                  <a 
                    href={`tel:${selectedCustomerPhone.alternate_phone}`}
                    className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                  >
                    Call
                  </a>
                </div>
              )}
            </div>
            <div className="flex justify-end pt-4 border-t">
              <Button 
                variant="outline" 
                onClick={() => setPhonePopupOpen(false)}
              >
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Send message (WhatsApp) – choose number when customer has alternate */}
        <Dialog open={whatsappNumberDialogOpen} onOpenChange={setWhatsappNumberDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Send message to which number?</DialogTitle>
              <DialogDescription asChild>
                <span>
                  {selectedCustomerForWhatsApp?.full_name ? (
                    <>
                      Choose number for{' '}
                      <span
                        className={customerNameClassName({
                          full_name: selectedCustomerForWhatsApp.full_name,
                          customer_tier: selectedCustomerForWhatsApp.customer_tier,
                        } as any)}
                      >
                        {selectedCustomerForWhatsApp.full_name}
                      </span>
                    </>
                  ) : (
                    'Choose which number to open in WhatsApp'
                  )}
                </span>
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              {selectedCustomerForWhatsApp?.phone && (
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div>
                    <div className="font-semibold text-gray-900">{selectedCustomerForWhatsApp.phone}</div>
                    <div className="text-sm text-blue-600 font-medium">Primary Number</div>
                  </div>
                  <Button
                    onClick={() => {
                      handleWhatsAppClick(selectedCustomerForWhatsApp.phone);
                      setWhatsappNumberDialogOpen(false);
                      setSelectedCustomerForWhatsApp(null);
                    }}
                  >
                    Send Message
                  </Button>
                </div>
              )}
              {selectedCustomerForWhatsApp?.alternate_phone && (
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div>
                    <div className="font-semibold text-gray-900">{selectedCustomerForWhatsApp.alternate_phone}</div>
                    <div className="text-sm text-gray-600 font-medium">Alternate Number</div>
                  </div>
                  <Button
                    onClick={() => {
                      handleWhatsAppClick(selectedCustomerForWhatsApp.alternate_phone!);
                      setWhatsappNumberDialogOpen(false);
                      setSelectedCustomerForWhatsApp(null);
                    }}
                  >
                    Send Message
                  </Button>
                </div>
              )}
            </div>
            <div className="flex justify-end pt-4 border-t">
              <Button variant="outline" onClick={() => { setWhatsappNumberDialogOpen(false); setSelectedCustomerForWhatsApp(null); }}>
                Cancel
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Photos Dialog */}
        <Dialog open={photosDialogOpen} onOpenChange={(open) => {
          if (!open && suspendedDialogRef.current?.type === 'gallery') return;
          setPhotosDialogOpen(open);
          if (!open) setSelectedJobPhotos(null);
        }}>
          <DialogContent ref={galleryDialogScrollRef} className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Camera className="w-5 h-5 text-blue-600" />
                {selectedJobPhotos?.customerId ? 'Customer Photos' : 'Job Photos'}
              </DialogTitle>
              <DialogDescription>
                {selectedJobPhotos?.customerId 
                  ? 'All photos associated with this customer from all jobs'
                  : 'All photos associated with this job'}
              </DialogDescription>
            </DialogHeader>
            {selectedJobPhotos && selectedJobPhotos.photos.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 py-4">
                {selectedJobPhotos.photos.map((photo, index) => (
                  <div key={index} className="relative group">
                    <div className="w-full h-48 bg-gray-100 rounded-lg border border-gray-200 overflow-hidden cursor-pointer">
                      <img
                        src={photo}
                        alt={`Photo ${index + 1}`}
                        className="w-full h-full object-cover transition-transform group-hover:scale-105"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                          const placeholder = (e.target as HTMLImageElement).nextElementSibling as HTMLElement;
                          if (placeholder) placeholder.style.display = 'flex';
                        }}
                        onClick={() => {
                          if (!selectedJobPhotos?.photos?.length) return;
                          const list = selectedJobPhotos.photos;
                          openPhotoViewerSuspended('gallery', list, index, {
                            jobPhotosMeta: selectedJobPhotos,
                          });
                        }}
                      />
                      <div 
                        className="hidden w-full h-full items-center justify-center bg-gray-200 text-gray-400"
                        style={{ display: 'none' }}
                      >
                        <Camera className="w-8 h-8" />
                      </div>
                    </div>
                    <div className="mt-1 text-xs text-center text-gray-500">Photo {index + 1}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-gray-500">
                <Camera className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p>No photos available for this job</p>
              </div>
            )}
            <div className="flex justify-end pt-4 border-t">
              <Button 
                variant="outline" 
                onClick={() => {
                  setPhotosDialogOpen(false);
                  setSelectedJobPhotos(null);
                }}
              >
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Address Dialog */}
        {selectedJobForAddress && (
          <Dialog
            open={addressDialogOpen[selectedJobForAddress.id] || false}
            onOpenChange={(open) => {
              setAddressDialogOpen(prev => ({ ...prev, [selectedJobForAddress.id]: open }));
              if (!open) {
                setSelectedJobForAddress(null);
                setSelectedCustomerForLocations(null);
              }
            }}
          >
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Full Address</DialogTitle>
                <DialogDescription asChild>
                  <span>
                    {(() => {
                      const customer =
                        selectedCustomerForLocations ||
                        (selectedJobForAddress.customer as Customer);
                      const display = getJobLocationDisplay(selectedJobForAddress, customer);
                      return (
                        <>
                          Service location for{' '}
                          <span className={customerNameClassName(customer as any)}>
                            {(customer as any)?.full_name ||
                              (customer as any)?.fullName ||
                              'Customer'}
                          </span>
                          {display.visibleLabel && display.visibleLabel !== 'Location' ? (
                            <>
                              {' '}
                              — <span className="font-medium">{display.visibleLabel}</span>
                            </>
                          ) : null}
                        </>
                      );
                    })()}
                  </span>
                </DialogDescription>
              </DialogHeader>
              <div className="py-4 space-y-4">
                <div className="text-sm text-gray-900 whitespace-pre-wrap break-words">
                  {(() => {
                    const customer =
                      selectedCustomerForLocations ||
                      (selectedJobForAddress.customer as Customer);
                    const display = getJobLocationDisplay(selectedJobForAddress, customer);
                    const fullAddr = formatAddressForDisplay(display.address)?.trim();
                    const vis = display.visibleLabel;
                    const loc = display.location as any;
                    const locFa = String(loc?.formattedAddress || loc?.formatted_address || '').trim();
                    const gLoc = typeof loc?.googleLocation === 'string' ? loc.googleLocation.trim() : '';

                    if (fullAddr) return fullAddr;
                    if (vis && vis !== 'Location') return vis;
                    if (locFa) return locFa;
                    if (gLoc) {
                      return (
                        <a
                          href={gLoc}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 break-all underline-offset-2 hover:underline"
                        >
                          {gLoc}
                        </a>
                      );
                    }
                    return 'No address available';
                  })()}
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setAddressDialogOpen(prev => ({ ...prev, [selectedJobForAddress.id]: false }));
                    setSelectedJobForAddress(null);
                    setSelectedCustomerForLocations(null);
                  }}
                >
                  Close
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {/* Fixed Bottom Navigation - Status Filters */}
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 shadow-lg">
          <div className="max-w-7xl mx-auto px-2 sm:px-4">
            <div className="grid grid-cols-4 gap-1 py-2">
              {/* Ongoing Button */}
              <button
                type="button"
                onClick={() => setStatusFilter('ONGOING')}
                className={`flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-lg transition-all duration-200 ${
                  statusFilter === 'ONGOING'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-gray-50 text-gray-400 opacity-60 hover:opacity-80'
                }`}
              >
                <Clock className={`h-5 w-5 ${statusFilter === 'ONGOING' ? 'text-white' : 'text-blue-400'}`} />
                <span className="text-xs font-medium">Ongoing</span>
                <span className={`text-xs font-bold ${statusFilter === 'ONGOING' ? 'text-blue-100' : 'text-gray-400'}`}>
                  {ongoingCount}
                </span>
              </button>

              {/* Follow-up Button */}
              <button
                type="button"
                onClick={() => setStatusFilter('RESCHEDULED')}
                className={`flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-lg transition-all duration-200 ${
                  statusFilter === 'RESCHEDULED'
                    ? 'bg-purple-600 text-white shadow-md'
                    : 'bg-gray-50 text-gray-400 opacity-60 hover:opacity-80'
                }`}
              >
                <CalendarPlus className={`h-5 w-5 ${statusFilter === 'RESCHEDULED' ? 'text-white' : 'text-purple-400'}`} />
                <span className="text-xs font-medium">Follow-up</span>
                <span className={`text-xs font-bold ${statusFilter === 'RESCHEDULED' ? 'text-purple-100' : 'text-gray-400'}`}>
                  {followUpCount}
                </span>
              </button>

              {/* Denied Button */}
              <button
                type="button"
                onClick={() => setStatusFilter('CANCELLED')}
                className={`flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-lg transition-all duration-200 ${
                  statusFilter === 'CANCELLED'
                    ? 'bg-red-600 text-white shadow-md'
                    : 'bg-gray-50 text-gray-400 opacity-60 hover:opacity-80'
                }`}
              >
                <XCircle className={`h-5 w-5 ${statusFilter === 'CANCELLED' ? 'text-white' : 'text-red-400'}`} />
                <span className="text-xs font-medium">Denied</span>
                <span className={`text-xs font-bold ${statusFilter === 'CANCELLED' ? 'text-red-100' : 'text-gray-400'}`}>
                  {deniedCount}
                </span>
              </button>

              {/* Completed Button */}
              <button
                type="button"
                onClick={() => { setStatusFilter('COMPLETED'); setCompletedDateFilter('today'); }}
                className={`flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-lg transition-all duration-200 ${
                  statusFilter === 'COMPLETED'
                    ? 'bg-green-600 text-white shadow-md'
                    : 'bg-gray-50 text-gray-400 opacity-60 hover:opacity-80'
                }`}
              >
                <CheckCircle className={`h-5 w-5 ${statusFilter === 'COMPLETED' ? 'text-white' : 'text-green-400'}`} />
                <span className="text-xs font-medium">Completed</span>
                <span className={`text-xs font-bold ${statusFilter === 'COMPLETED' ? 'text-green-100' : 'text-gray-400'}`}>
                  {completedTabCount}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Options Dialog for 3-dot menu */}
      {selectedJobForOptions && (
        <Dialog 
          open={optionsDialogOpen[selectedJobForOptions.id] || false} 
          onOpenChange={(open) => {
            setOptionsDialogOpen(prev => ({ ...prev, [selectedJobForOptions.id]: open }));
            if (!open) {
              setSelectedJobForOptions(null);
            }
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Job Options</DialogTitle>
              <DialogDescription>
                Choose an action for this job
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3 py-4">
              {/* AMC Info - Show if customer has active AMC */}
              {selectedJobForOptions && customerAMCStatus[(selectedJobForOptions.customer as any)?.id] && (
                <Button
                  variant="outline"
                  className="w-full justify-start text-green-700 hover:text-green-800 hover:bg-green-50"
                  onClick={async () => {
                    const customerId = (selectedJobForOptions.customer as any)?.id;
                    if (customerId) {
                      setLoadingAMCInfo(true);
                      setSelectedCustomerForAMC({
                        id: customerId,
                        name: (selectedJobForOptions.customer as any)?.full_name || 'Customer'
                      });
                      setAmcInfoDialogOpen(true);
                      
                      const { data, error } = await db.amcContracts.getActiveByCustomerId(customerId);
                      if (!error && data) {
                        setAmcInfo(data);
                      } else {
                        setAmcInfo(null);
                      }
                      setLoadingAMCInfo(false);
                    }
                    setOptionsDialogOpen(prev => ({ ...prev, [selectedJobForOptions.id]: false }));
                    setSelectedJobForOptions(null);
                  }}
                >
                  <Star className="w-4 h-4 mr-2" />
                  AMC Info
                </Button>
              )}
              {/* Reports — not on completed (that menu is only for missing bill/payment). */}
              {normalizeJobStatus(selectedJobForOptions.status) !== 'COMPLETED' && (
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={async () => {
                  const job = selectedJobForOptions;
                  const customer = job.customer as any;
                  const customerUuid =
                    customer?.id || (job as any).customer_id || (job as any).customerId;
                  if (customer || customerUuid) {
                    setSelectedCustomerForReport({
                      ...(customer || {}),
                      id: customerUuid,
                      customer_id:
                        customer?.customer_id ||
                        customer?.customerId ||
                        (customer as any)?.customer_id,
                      full_name:
                        customer?.full_name ||
                        customer?.fullName ||
                        'Customer',
                      phone: customer?.phone,
                      email: customer?.email,
                    });
                    setCustomerReportDialogOpen(true);
                    setOptionsDialogOpen(prev => ({ ...prev, [job.id]: false }));
                    setSelectedJobForOptions(null);
                  }
                }}
              >
                <FileText className="w-4 h-4 mr-2" />
                Reports
              </Button>
              )}
              {(normalizeJobStatus(selectedJobForOptions.status) === 'ASSIGNED' ||
                normalizeJobStatus(selectedJobForOptions.status) === 'EN_ROUTE' ||
                normalizeJobStatus(selectedJobForOptions.status) === 'IN_PROGRESS') && (
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => {
                    const job = selectedJobForOptions;
                    setOptionsDialogOpen(prev => ({ ...prev, [job.id]: false }));
                    setSelectedJobForOptions(null);
                    openCustomerUpdateDialog(job);
                  }}
                >
                  <Pencil className="w-4 h-4 mr-2" />
                  Update customer details
                </Button>
              )}
              {normalizeJobStatus(selectedJobForOptions.status) === 'COMPLETED' && (() => {
                const { missingBill, missingPayment } = getCompletedJobMissingMedia(
                  selectedJobForOptions as any
                );
                if (!missingBill && !missingPayment) return null;
                return (
                  <>
                    {missingBill && missingPayment ? (
                      <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                        Missing: bill photo and payment screenshot
                      </p>
                    ) : missingBill ? (
                      <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                        Missing: bill photo
                      </p>
                    ) : (
                      <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                        Missing: payment screenshot
                      </p>
                    )}
                    {missingBill ? (
                      <Button
                        variant="outline"
                        className="w-full justify-start"
                        onClick={() => {
                          const job = selectedJobForOptions;
                          setOptionsDialogOpen((prev) => ({ ...prev, [job.id]: false }));
                          setSelectedJobForOptions(null);
                          setMissingPhotoUrls([]);
                          setMissingPhotoSources({});
                          setMissingPhotoDialog({ job, kind: 'bill' });
                        }}
                      >
                        <Receipt className="w-4 h-4 mr-2" />
                        Add bill photo
                      </Button>
                    ) : null}
                    {missingPayment ? (
                      <Button
                        variant="outline"
                        className="w-full justify-start"
                        onClick={() => {
                          const job = selectedJobForOptions;
                          setOptionsDialogOpen((prev) => ({ ...prev, [job.id]: false }));
                          setSelectedJobForOptions(null);
                          setMissingPhotoUrls([]);
                          setMissingPhotoSources({});
                          setMissingPhotoDialog({ job, kind: 'payment' });
                        }}
                      >
                        <Camera className="w-4 h-4 mr-2" />
                        Add payment screenshot
                      </Button>
                    ) : null}
                  </>
                );
              })()}
              {(normalizeJobStatus(selectedJobForOptions.status) === 'ASSIGNED' || normalizeJobStatus(selectedJobForOptions.status) === 'EN_ROUTE') && (
                <Button
                  variant="outline"
                  className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50"
                  onClick={() => {
                    setOptionsDialogOpen(prev => ({ ...prev, [selectedJobForOptions.id]: false }));
                    handleDenyJob(selectedJobForOptions);
                    setSelectedJobForOptions(null);
                  }}
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  Deny Job
                </Button>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => {
                  setOptionsDialogOpen(prev => ({ ...prev, [selectedJobForOptions.id]: false }));
                  setSelectedJobForOptions(null);
                }}
              >
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Add missing bill / payment photo on a completed job */}
      <Dialog
        open={Boolean(missingPhotoDialog)}
        onOpenChange={(open) => {
          if (!open) {
            setMissingPhotoDialog(null);
            setMissingPhotoUrls([]);
            setMissingPhotoSources({});
            setMissingPhotoUploading(false);
            setMissingPhotoSaving(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-md max-h-[min(92dvh,720px)] flex flex-col gap-3 overflow-hidden p-4 sm:p-6">
          <DialogHeader className="shrink-0 pr-8">
            <DialogTitle>
              {missingPhotoDialog?.kind === 'bill' ? 'Add bill photo' : 'Add payment screenshot'}
            </DialogTitle>
            <DialogDescription>
              {missingPhotoDialog?.kind === 'bill'
                ? 'Upload the bill photo, then tap Save.'
                : 'Upload the payment screenshot, then tap Save.'}
            </DialogDescription>
          </DialogHeader>
          {missingPhotoDialog ? (
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1">
              <CompletionPhotoStep
                dense
                label={missingPhotoDialog.kind === 'bill' ? 'Bill photo' : 'Payment screenshot'}
                hint={
                  missingPhotoDialog.kind === 'bill'
                    ? 'Photo of the signed bill or handwritten invoice.'
                    : 'Screenshot of the UPI / online payment.'
                }
                images={missingPhotoUrls}
                onImagesChange={setMissingPhotoUrls}
                onCaptureSourcesChange={(sources) =>
                  setMissingPhotoSources((prev) => ({ ...prev, ...sources }))
                }
                onUploadStateChange={setMissingPhotoUploading}
                maxImages={missingPhotoDialog.kind === 'bill' ? 5 : 3}
                folder={missingPhotoDialog.kind === 'bill' ? 'bills' : 'payments'}
                jobId={missingPhotoDialog.job.id}
                photoType={missingPhotoDialog.kind === 'bill' ? 'bill' : 'payment'}
              />
            </div>
          ) : null}
          <DialogFooter className="shrink-0 gap-2 border-t pt-3 sm:gap-0">
            <Button
              variant="ghost"
              disabled={missingPhotoSaving}
              onClick={() => {
                setMissingPhotoDialog(null);
                setMissingPhotoUrls([]);
                setMissingPhotoSources({});
                setMissingPhotoUploading(false);
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={
                missingPhotoSaving ||
                missingPhotoUploading ||
                missingPhotoUrls.filter(isUploadedMediaUrl).length === 0 ||
                missingPhotoUrls.some(hasPendingLocalOrUploadingPhoto)
              }
              onClick={() => {
                void saveCompletedJobMissingPhotos();
              }}
            >
              {missingPhotoSaving
                ? 'Saving…'
                : missingPhotoUploading
                  ? 'Uploading…'
                  : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AMC Info Dialog */}
      <Dialog open={amcInfoDialogOpen} onOpenChange={setAmcInfoDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Star className="w-5 h-5 text-green-600" />
              AMC Information
            </DialogTitle>
            <DialogDescription>
              AMC details for {selectedCustomerForAMC?.name || 'customer'}
            </DialogDescription>
          </DialogHeader>
          {loadingAMCInfo ? (
            <div className="py-8 text-center">
              <div className="flex items-center justify-center gap-2">
                <RefreshCw className="w-5 h-5 animate-spin text-gray-400" />
                <span className="text-gray-600">Loading AMC information...</span>
              </div>
            </div>
          ) : amcInfo ? (
            <div className="py-4 space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">Status:</span>
                  <Badge className="bg-green-600 text-white border-0">
                    {amcInfo.status}
                  </Badge>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 font-medium">Service brand:</span>
                  <span className="text-gray-900 font-semibold">
                    {getAmcDocumentBrandLabel(amcInfo)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600 font-medium">Start Date:</span>
                    <p className="text-gray-900 font-semibold mt-1">
                      {new Date(amcInfo.start_date).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric'
                      })}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-600 font-medium">End Date:</span>
                    <p className="text-gray-900 font-semibold mt-1">
                      {new Date(amcInfo.end_date).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric'
                      })}
                    </p>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600 font-medium">Duration:</span>
                    <p className="text-gray-900 font-semibold mt-1">
                      {amcInfo.years} {amcInfo.years === 1 ? 'year' : 'years'}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-600 font-medium">Includes Prefilter:</span>
                    <p className="text-gray-900 font-semibold mt-1">
                      {amcInfo.includes_prefilter ? 'Yes' : 'No'}
                    </p>
                  </div>
                </div>
                
                {(() => {
                  // Parse additional_info to extract description and AMC cost
                  let description = '';
                  let additionalInfo = '';
                  let amcCost: number | null = null;
                  let totalAmount: number | null = null;
                  
                  if (amcInfo.additional_info) {
                    try {
                      let parsed: any = {};
                      if (typeof amcInfo.additional_info === 'string') {
                        parsed = JSON.parse(amcInfo.additional_info);
                      } else {
                        parsed = amcInfo.additional_info;
                      }
                      
                      description = parsed.description || parsed.notes || '';
                      additionalInfo = parsed.notes || '';
                      // Extract AMC cost from additional_info
                      amcCost = parsed.amc_cost || null;
                      totalAmount = parsed.total_amount || null;
                    } catch (e) {
                      // If not JSON, treat as plain text
                      additionalInfo = amcInfo.additional_info;
                    }
                  }
                  
                  // Display AMC amount - prioritize agreed_amount, then amc_cost/total_amount, then amcInfo.amount
                  let agreedAmount: number | null = null;
                  if (amcInfo.additional_info) {
                    try {
                      let parsed: any = {};
                      if (typeof amcInfo.additional_info === 'string') {
                        parsed = JSON.parse(amcInfo.additional_info);
                      } else {
                        parsed = amcInfo.additional_info;
                      }
                      agreedAmount = parsed.agreed_amount || parsed.agreed || null;
                    } catch (e) {
                      // Ignore parse errors
                    }
                  }
                  
                  const displayAmount = agreedAmount || amcCost || totalAmount || amcInfo.amount;
                  const amountLabel = agreedAmount ? 'Agreed Amount' : (amcCost || totalAmount ? 'AMC Amount' : 'AMC Cost');
                  
                  return (
                    <>
                      {displayAmount && (
                        <div className="text-sm">
                          <span className="text-gray-600 font-medium">{amountLabel}:</span>
                          <p className="text-gray-900 font-semibold mt-1">
                            ₹{parseFloat(displayAmount.toString()).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                        </div>
                      )}
                      {description && (
                        <div className="pt-3 border-t border-green-200">
                          <span className="text-gray-600 font-medium text-sm">Description / Summary:</span>
                          <p className="text-gray-900 mt-2 whitespace-pre-wrap break-words">
                            {description}
                          </p>
                        </div>
                      )}
                      {additionalInfo && !description && (
                        <div className="pt-3 border-t border-green-200">
                          <span className="text-gray-600 font-medium text-sm">Additional Information:</span>
                          <p className="text-gray-900 mt-2 whitespace-pre-wrap break-words">
                            {additionalInfo}
                          </p>
                        </div>
                      )}
                    </>
                  );
                })()}
                
                <div className="pt-3 border-t border-green-200 text-xs text-gray-500">
                  <p>Created: {new Date(amcInfo.created_at).toLocaleString('en-IN')}</p>
                  {amcInfo.updated_at && amcInfo.updated_at !== amcInfo.created_at && (
                    <p>Last Updated: {new Date(amcInfo.updated_at).toLocaleString('en-IN')}</p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-gray-500">
              <AlertCircle className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p>No active AMC contract found for this customer</p>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAmcInfoDialogOpen(false);
                setSelectedCustomerForAMC(null);
                setAmcInfo(null);
              }}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Blocking new-jobs alert — must acknowledge so newly assigned jobs aren't missed */}
      <AlertDialog open={newJobsAlertOpen} onOpenChange={setNewJobsAlertOpen}>
        <AlertDialogContent
          className="max-w-md"
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500"></span>
              </span>
              {newAssignedJobs.length === 1
                ? 'You have 1 new job'
                : `You have ${newAssignedJobs.length} new jobs`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              These were just assigned to you. Review them so nothing gets missed.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="max-h-[50vh] overflow-y-auto space-y-2">
            {newAssignedJobs.map((job) => {
              const c = job.customer as any;
              const sd = (job as any).scheduled_date || (job as any).scheduledDate;
              const slot = (job as any).scheduled_time_slot || (job as any).scheduledTimeSlot;
              const serviceLine = [
                (job as any).service_type || (job as any).serviceType,
                (job as any).service_sub_type || (job as any).serviceSubType,
              ]
                .filter(Boolean)
                .join(' · ');
              return (
                <div
                  key={job.id}
                  className="rounded-lg border border-blue-200 bg-blue-50/60 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm font-semibold">
                      {(job as any).job_number || (job as any).jobNumber || '—'}
                    </span>
                    <Badge className="bg-blue-100 text-blue-800 border-blue-300 text-[10px]">
                      NEW
                    </Badge>
                  </div>
                  <p className={`text-sm font-medium ${customerNameClassName(c)}`}>
                    {c?.full_name || c?.fullName || 'Customer'}
                  </p>
                  {serviceLine && (
                    <p className="text-xs text-muted-foreground">{serviceLine}</p>
                  )}
                  {(sd || slot) && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Calendar className="h-3 w-3 shrink-0" />
                      {[sd, slot].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <AlertDialogFooter>
            <AlertDialogAction onClick={acknowledgeNewJobs} className="w-full">
              Got it — show my jobs
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Customer Report Dialog */}
      <Dialog
        open={customerReportDialogOpen}
        onOpenChange={(open) => {
          if (!open && suspendedDialogRef.current?.type === 'report') return;
          setCustomerReportDialogOpen(open);
        }}
      >
        <DialogContent ref={reportDialogScrollRef} className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Customer Report -{' '}
              <span className={customerNameClassName(selectedCustomerForReport as any)}>
                {selectedCustomerForReport?.full_name || selectedCustomerForReport?.fullName || 'Unknown'}
              </span>
            </DialogTitle>
            <DialogDescription>
              Complete service history and job details
            </DialogDescription>
          </DialogHeader>
          
          {selectedCustomerForReport && (() => {
            // Use fetched customer report jobs (filtered to completed)
            const completedJobs = customerReportJobs
              .sort((a, b) => {
                // Sort by completed_at date, latest first
                const dateA = (a as any).completed_at || a.completedAt || a.created_at || a.createdAt || '';
                const dateB = (b as any).completed_at || b.completedAt || b.created_at || b.createdAt || '';
                if (!dateA && !dateB) return 0;
                if (!dateA) return 1;
                if (!dateB) return -1;
                return new Date(dateB).getTime() - new Date(dateA).getTime();
              });
            
            return (
              <div className="space-y-6 py-4">
                {/* Customer Info */}
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h3 className="font-semibold text-lg mb-3">Customer Information</h3>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-gray-500">Name:</span>{' '}
                      <span className={customerNameClassName(selectedCustomerForReport as any)}>
                        {selectedCustomerForReport.full_name || selectedCustomerForReport.fullName}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Customer ID:</span> {selectedCustomerForReport.customer_id || selectedCustomerForReport.customerId}
                    </div>
                    <div>
                      <span className="text-gray-500">Phone:</span> {selectedCustomerForReport.phone}
                    </div>
                    <div>
                      <span className="text-gray-500">Email:</span> {selectedCustomerForReport.email && selectedCustomerForReport.email.trim() && !selectedCustomerForReport.email.toLowerCase().includes('nomail') && !selectedCustomerForReport.email.toLowerCase().includes('no@mail')
                        ? selectedCustomerForReport.email
                        : 'nomail@mail'}
                    </div>
                    {((selectedCustomerForReport as any).raw_water_tds != null && (selectedCustomerForReport as any).raw_water_tds > 0) && (
                      <div>
                        <span className="text-gray-500">Raw Water TDS:</span> {(selectedCustomerForReport as any).raw_water_tds} ppm
                      </div>
                    )}
                  </div>
                </div>

                {/* Completed Jobs */}
                <div>
                  <h3 className="font-semibold text-lg mb-3">Completed Jobs ({completedJobs.length})</h3>
                  {loadingCustomerReportJobs ? (
                    <div className="text-center py-8 text-gray-500">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-3"></div>
                      <p className="text-sm">Loading completed jobs...</p>
                    </div>
                  ) : completedJobs.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <CheckCircle className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                      <p className="text-sm">No completed jobs found</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {completedJobs.map((job) => {
                        // Extract completion details
                        const completionNotes = (job as any).completion_notes || job.completionNotes || '';
                        const completedAt = (job as any).completed_at || job.completedAt || null;
                        const completedWhenLabel = completedAt ? formatCompletedWhen(completedAt) : null;
                        const equipmentDisplay = getJobEquipmentDisplay(
                          job as Record<string, unknown>,
                          selectedCustomerForReport as Record<string, unknown> | null
                        );
                        const completedBy = (job as any).completed_by || job.completedBy || null;
                        const actualCost = (job as any).actual_cost || job.actual_cost || null;
                        const paymentAmount = (job as any).payment_amount || job.payment_amount || null;
                        const paymentMethod = (job as any).payment_method || job.payment_method || null;
                        
                        // Get technician name who completed the job
                        const isDirectSale = ((job as any).service_sub_type || job.serviceSubType) === 'Direct Sale';
                        let completedByName = 'Unknown';
                        if (isDirectSale || isOfficeCompletedJob(job)) {
                          completedByName = 'Office';
                        } else if (completedBy) {
                          if (completedBy === 'admin' || completedBy === 'Admin') {
                            completedByName = 'Admin';
                          } else {
                            // Try to find technician by ID from allTechniciansForReports (includes all technicians, not just those with QR codes)
                            const completedByTechnician = allTechniciansForReports.find(tech => tech.id === completedBy);
                            completedByName = completedByTechnician?.fullName || completedByTechnician?.full_name || 'Technician';
                          }
                        }
                        
                        const requirements = parseJobRequirements(
                          (job as any).requirements || job.requirements
                        );
                        const amcInfo = requirements.find((r: any) => r?.amc_info)?.amc_info || null;
                        const qrPhotos = requirements.find((r: any) => r?.qr_photos)?.qr_photos || null;
                        const { billPhotos, paymentScreenshot, allPhotos: reportBillAllPhotos } =
                          resolveJobBillAndPaymentPhotos({
                            ...(job as any),
                            payment_method: paymentMethod,
                          });
                        
                        return (
                          <div key={job.id} className="border border-gray-200 rounded-lg p-4 bg-white">
                            <div className="flex items-start justify-between mb-3">
                              <div>
                                <div className="font-semibold text-lg">
                                  {(job as any).job_number || job.jobNumber}
                                </div>
                                <div className="text-sm text-gray-600">
                                  {(job as any).service_type || job.serviceType} - {(job as any).service_sub_type || job.serviceSubType}
                                </div>
                                {completedWhenLabel && (
                                  <div className="text-xs text-gray-500 mt-1">
                                    Completed {completedWhenLabel}
                                  </div>
                                )}
                              </div>
                              <Badge className="bg-green-100 text-green-800">Completed</Badge>
                            </div>
                            
                            <div className="space-y-3 mt-4 pt-4 border-t border-gray-200">
                              {/* Bill Amount */}
                              {(actualCost || paymentAmount) && (
                                <div className="flex items-start gap-2">
                                  <span className="text-sm font-medium text-gray-700 w-36 shrink-0">Amount:</span>
                                  <span className="text-sm text-gray-900 flex-1 min-w-0 break-words">₹{actualCost || paymentAmount}</span>
                                </div>
                              )}
                              
                              {/* Payment Mode - Only show if payment method exists (not null) */}
                              {/* For zero amount jobs, payment method will be null and this section won't display */}
                              {paymentMethod && (
                                <div className="flex items-start gap-2">
                                  <span className="text-sm font-medium text-gray-700 w-36 shrink-0">Payment Mode:</span>
                                  <span className="text-sm text-gray-900 flex-1 min-w-0 break-words">{
                                    paymentMethod === 'CASH' ? 'Cash' : 
                                    paymentMethod === 'ONLINE' || paymentMethod === 'UPI' || paymentMethod === 'CARD' || paymentMethod === 'BANK_TRANSFER' ? 'Online' : 
                                    paymentMethod
                                  }</span>
                                </div>
                              )}

                              {(() => {
                                const rawBrand = (job as any).service_brand ?? (job as any).serviceBrand;
                                const brand = normalizeServiceBrand(rawBrand);
                                if (!brand) return null;
                                return (
                                  <div className="flex items-start gap-2">
                                    <span className="text-sm font-medium text-gray-700 w-36 shrink-0">Service Brand:</span>
                                    <span className="text-sm text-gray-900 flex-1 min-w-0 break-words">{getServiceBrandLabel(brand)}</span>
                                  </div>
                                );
                              })()}
                              
                              {/* Lead Source */}
                              {(() => {
                                // Find lead_source in requirements
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
                                  const flatReq = requirements.flat();
                                  for (const req of flatReq) {
                                    if (req && typeof req === 'object' && req.lead_source) {
                                      leadSource = req.lead_source;
                                      break;
                                    }
                                  }
                                }
                                
                                if (leadSource && leadSource !== 'Website') {
                                  return (
                                    <div className="flex items-start gap-2">
                                      <span className="text-sm font-medium text-gray-700 w-36 shrink-0">Lead Source:</span>
                                      <span className="text-sm text-gray-900 flex-1 min-w-0 break-words">{leadSource}</span>
                                    </div>
                                  );
                                }
                                if (leadSource === 'Website') {
                                  const bookedAt = (job as any).created_at || (job as any).createdAt;
                                  if (bookedAt) {
                                    const formatted = new Date(bookedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
                                    return (
                                      <div className="flex items-start gap-2">
                                        <span className="text-sm font-medium text-gray-700 w-36 shrink-0">Booked at:</span>
                                        <span className="text-sm text-gray-900 flex-1 min-w-0 break-words">{formatted}</span>
                                      </div>
                                    );
                                  }
                                }
                                return null;
                              })()}

                              {/* Raw Water TDS - from selectedCustomerForReport (jobs from getByCustomerId don't have customer) */}
                              {((selectedCustomerForReport as any)?.raw_water_tds != null && (selectedCustomerForReport as any)?.raw_water_tds > 0) && (
                                <div className="flex items-start gap-2">
                                  <span className="text-sm font-medium text-gray-700 w-36 shrink-0">Raw Water TDS:</span>
                                  <span className="text-sm text-gray-900 flex-1 min-w-0 break-words">{(selectedCustomerForReport as any).raw_water_tds} ppm</span>
                                </div>
                              )}
                              
                              {/* QR Code */}
                              {(paymentMethod === 'ONLINE' || paymentMethod === 'UPI' || paymentMethod === 'CARD' || paymentMethod === 'BANK_TRANSFER') && qrPhotos?.selected_qr_code_name && (
                                <div className="flex items-start gap-2">
                                  <span className="text-sm font-medium text-gray-700 w-36 shrink-0">QR Code:</span>
                                  <span className="text-sm text-gray-900 flex-1 min-w-0 break-words">{qrPhotos.selected_qr_code_name}</span>
                                </div>
                              )}

                              {equipmentDisplay && (
                                <div className="flex items-start gap-2">
                                  <span className="text-sm font-medium text-gray-700 w-36 shrink-0">{equipmentDisplay.label}:</span>
                                  <span className="text-sm text-gray-900 flex-1 min-w-0 break-words">{equipmentDisplay.value}</span>
                                </div>
                              )}

                              {completionNotes && (
                                <div className="rounded-lg border border-violet-200 bg-violet-50/90 px-3 py-2.5">
                                  <div className="text-xs font-semibold uppercase tracking-wide text-violet-800 mb-1">
                                    Notes
                                  </div>
                                  <div className="text-sm text-violet-950/90 whitespace-pre-wrap">{completionNotes}</div>
                                </div>
                              )}
                              
                              {/* Payment Screenshot & Bill Photos - Combined Section */}
                              {reportBillAllPhotos.length > 0 ? (
                                <div className="mt-3 pt-3 border-t border-gray-200">
                                  <div className="font-medium text-gray-900 mb-3">Payment & Bill Documents</div>
                                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                    {/* Payment Screenshot */}
                                    {paymentScreenshot && (
                                      <div 
                                        className="relative group cursor-pointer rounded-lg overflow-hidden border-2 border-blue-300 hover:border-blue-500 transition-all"
                                        onClick={() => {
                                          openPhotoViewerSuspended('report', reportBillAllPhotos, 0);
                                        }}
                                      >
                                        <img 
                                          src={paymentScreenshot} 
                                          alt="Payment Screenshot" 
                                          className="w-full h-40 sm:h-48 object-cover transition-transform group-hover:scale-105" 
                                        />
                                        <div className="absolute top-2 left-2 bg-blue-600 text-white text-xs font-semibold px-2 py-1 rounded">
                                          Payment
                                        </div>
                                        <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-opacity flex items-center justify-center">
                                          <div className="opacity-0 group-hover:opacity-100 transition-opacity text-white text-sm font-medium bg-black bg-opacity-50 px-3 py-1 rounded">
                                            Click to view
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                    
                                    {/* Bill Photos */}
                                    {billPhotos.length > 0 &&
                                      billPhotos.map((photo, idx) => {
                                      const photoIndex = paymentScreenshot
                                        ? reportBillAllPhotos.indexOf(photo)
                                        : idx;
                                      
                                      return (
                                      <div
                                        key={idx}
                                        className="relative group cursor-pointer rounded-lg overflow-hidden border-2 border-green-300 hover:border-green-500 transition-all"
                                        onClick={() => {
                                          openPhotoViewerSuspended(
                                            'report',
                                            reportBillAllPhotos,
                                            photoIndex >= 0 ? photoIndex : idx,
                                          );
                                        }}
                                      >
                                        <img 
                                          src={photo} 
                                          alt={`Bill photo ${idx + 1}`} 
                                          className="w-full h-40 sm:h-48 object-cover transition-transform group-hover:scale-105" 
                                        />
                                        <div className="absolute top-2 left-2 bg-green-600 text-white text-xs font-semibold px-2 py-1 rounded">
                                          Bill {idx + 1}
                                        </div>
                                        <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-opacity flex items-center justify-center">
                                          <div className="opacity-0 group-hover:opacity-100 transition-opacity text-white text-sm font-medium bg-black bg-opacity-50 px-3 py-1 rounded">
                                            Click to view
                                          </div>
                                        </div>
                                      </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              ) : null}
                              
                              {/* AMC Details */}
                              {amcInfo && (() => {
                                // Parse additional_info to extract description
                                let description = '';
                                let additionalInfo = '';
                                if (amcInfo.additional_info) {
                                  try {
                                    if (typeof amcInfo.additional_info === 'string') {
                                      const parsed = JSON.parse(amcInfo.additional_info);
                                      description = parsed.description || parsed.notes || '';
                                      additionalInfo = parsed.notes || '';
                                    } else {
                                      description = amcInfo.additional_info.description || amcInfo.additional_info.notes || '';
                                      additionalInfo = amcInfo.additional_info.notes || '';
                                    }
                                  } catch (e) {
                                    // If not JSON, treat as plain text
                                    additionalInfo = amcInfo.additional_info;
                                  }
                                }
                                
                                return (
                                <div className="mt-3 pt-3 border-t border-green-300 bg-green-50 rounded-lg p-3">
                                  <div className="flex items-center gap-2 mb-2">
                                    <Badge className="bg-green-600 text-white">AMC Active</Badge>
                                    <div className="font-semibold text-gray-900">AMC Details</div>
                                  </div>
                                  <div className="space-y-2 text-sm">
                                    <div className="flex items-center gap-2">
                                      <span className="text-gray-600 font-medium w-32">Start Date:</span>
                                      <span className="text-gray-900 font-semibold">{amcInfo.date_given ? new Date(amcInfo.date_given).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-gray-600 font-medium w-32">End Date:</span>
                                      <span className="text-gray-900 font-semibold">{amcInfo.end_date ? new Date(amcInfo.end_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-gray-600 font-medium w-32">Duration:</span>
                                      <span className="text-gray-900 font-semibold">{amcInfo.years || 1} {amcInfo.years === 1 ? 'year' : 'years'}</span>
                                    </div>
                                      {amcInfo.amount && (
                                        <div className="flex items-center gap-2">
                                          <span className="text-gray-600 font-medium w-32">AMC Amount:</span>
                                          <span className="text-gray-900 font-semibold">₹{parseFloat(amcInfo.amount.toString()).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                        </div>
                                      )}
                                    {amcInfo.includes_prefilter !== undefined && (
                                      <div className="flex items-center gap-2">
                                        <span className="text-gray-600 font-medium w-32">Includes Prefilter:</span>
                                        <span className="text-gray-900 font-semibold">{amcInfo.includes_prefilter ? 'Yes' : 'No'}</span>
                                      </div>
                                    )}
                                      {description && (
                                        <div className="mt-3 pt-3 border-t border-green-200">
                                          <div className="text-gray-600 font-medium mb-2">Description / Summary:</div>
                                          <div className="text-gray-900 whitespace-pre-wrap bg-white p-2 rounded border border-green-200">{description}</div>
                                        </div>
                                      )}
                                      {additionalInfo && !description && (
                                      <div className="mt-3 pt-3 border-t border-green-200">
                                        <div className="text-gray-600 font-medium mb-2">Additional Info:</div>
                                          <div className="text-gray-900 whitespace-pre-wrap bg-white p-2 rounded border border-green-200">{additionalInfo}</div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                                );
                              })()}
                              
                              {/* Completed By */}
                              {completedByName && (
                                <div className="mt-3 pt-3 border-t border-gray-200">
                                  <div className="flex items-start gap-2">
                                    <span className="text-sm font-medium text-gray-700 w-36 shrink-0">Completed By:</span>
                                    <span className="text-sm text-gray-900 flex-1 min-w-0 break-words">{completedByName}</span>
                                  </div>
                                </div>
                              )}
                              
                              {/* Job Description */}
                              {job.description && (
                                <div className="mt-3 pt-3 border-t border-gray-200">
                                  <div className="font-medium text-gray-900 mb-1">Description:</div>
                                  <div className="text-sm text-gray-700 whitespace-pre-wrap">{job.description}</div>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setCustomerReportDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Customer search (from Options) — report + new job for any customer */}
      {customerSearchDialogOpen && (
        <React.Suspense fallback={null}>
          <TechnicianCustomerSearchDialog
            open={customerSearchDialogOpen}
            onOpenChange={setCustomerSearchDialogOpen}
            onViewReport={(c) => {
              setSelectedCustomerForReport({
                ...c,
                id: c.id,
                full_name: c.full_name || 'Customer',
                phone: c.phone,
              });
              setCustomerReportDialogOpen(true);
            }}
            onNewJob={(c) => {
              setTechNewJobCustomer(c);
            }}
          />
        </React.Suspense>
      )}

      {/* Technician job creation — same form as admin, lead cost hidden
          (server applies the default via technician_create_job RPC) */}
      {techNewJobCustomer && (
        <React.Suspense fallback={null}>
          <TechnicianNewJobDialog
            open={!!techNewJobCustomer}
            onOpenChange={(open) => {
              if (!open) setTechNewJobCustomer(null);
            }}
            customer={techNewJobCustomer as any}
            technicians={technicians}
            onJobCreated={() => {
              setTechNewJobCustomer(null);
              setCustomerSearchDialogOpen(false);
            }}
            technicianMode
          />
        </React.Suspense>
      )}

      {/* Photo viewer — completed jobs, job gallery, and customer report */}
      <PhotoViewerDialog
        open={photoViewerOpen}
        onOpenChange={(open) => {
          if (!open) closePhotoViewer();
          else setPhotoViewerOpen(true);
        }}
        selectedPhoto={selectedPhoto}
        selectedBillPhotos={selectedBillPhotos}
        selectedJobPhotos={
          selectedJobPhotos
            ? {
                jobId: selectedJobPhotos.jobId,
                photos: selectedJobPhotos.photos,
                type: 'after' as const,
              }
            : null
        }
        showDownload={false}
        showNavigation={Boolean(
          (selectedBillPhotos && selectedBillPhotos.length > 1) ||
            (selectedJobPhotos?.photos && selectedJobPhotos.photos.length > 1),
        )}
        onPrevious={goToPreviousPhoto}
        onNext={goToNextPhoto}
        onDownload={() => {}}
        onClose={closePhotoViewer}
      />

      <AddReminderDialog
        open={addReminderDialogOpen}
        onOpenChange={setAddReminderDialogOpen}
        entity={reminderEntity}
        contextLabel={reminderContextLabel || undefined}
      />

      {/* Job Parts Used Dialog - technician can add parts for completed jobs */}
      {user && (
        <JobPartsUsedDialog
          open={partsUsedDialogOpen}
          onOpenChange={(open) => {
            setPartsUsedDialogOpen(open);
            if (!open) setSelectedJobForParts(null);
          }}
          job={selectedJobForParts}
          technician={{
            id: user.technicianId || user.id,
            fullName: (user as any).name || (user as any).email || 'Me',
            full_name: (user as any).name || (user as any).email || 'Me',
            phone: (user as any).phone || '',
            email: (user as any).email || '',
            employeeId: (user as any).employeeId || (user as any).employee_id || '',
            skills: { serviceTypes: [], certifications: [], experience: 0, rating: 0 },
            serviceAreas: { pincodes: [], cities: [], maxDistance: 0 },
            status: 'AVAILABLE',
          }}
        />
      )}

      {/* Technician ID Card QR Code Dialog */}
      {/* Inventory Dialog */}
      {user && (
        <Dialog open={inventoryDialogOpen} onOpenChange={setInventoryDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0">
            <DialogHeader className="sr-only">
              <DialogTitle>My Inventory</DialogTitle>
            </DialogHeader>
            <TechnicianInventoryView 
              technicianId={user.technicianId || user.id} 
              onClose={() => setInventoryDialogOpen(false)}
            />
          </DialogContent>
        </Dialog>
      )}

      <Dialog
        open={technicianIdCardDialogOpen}
        onOpenChange={(open) => {
          setTechnicianIdCardDialogOpen(open);
          if (!open) setSelectedIdCardBrand(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="w-5 h-5" />
              {selectedIdCardBrand ? `${getDocumentBrandLabel(selectedIdCardBrand)} ID card` : 'ID card QR'}
            </DialogTitle>
            {!selectedIdCardBrand ? (
              <DialogDescription>Select which brand ID card to show</DialogDescription>
            ) : null}
          </DialogHeader>
          <div className="flex flex-col items-center justify-center py-4">
            {(() => {
              const technicianId = user?.technicianId || user?.id;

              if (!technicianId) {
                return (
                  <div className="text-center py-8">
                    <QrCode className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                    <p className="text-gray-600">Technician ID not available</p>
                    <p className="text-sm text-gray-500 mt-2">Please contact admin</p>
                  </div>
                );
              }

              if (!selectedIdCardBrand) {
                return (
                  <div className="flex w-full flex-col gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-12 justify-start px-4 text-base border-blue-200 bg-blue-50/50 hover:bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30"
                      onClick={() => setSelectedIdCardBrand('hydrogenro')}
                    >
                      Hydrogen RO
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-12 justify-start px-4 text-base border-violet-200 bg-violet-50/50 hover:bg-violet-50 dark:border-violet-800 dark:bg-violet-950/30"
                      onClick={() => setSelectedIdCardBrand('elevenro')}
                    >
                      Eleven RO
                    </Button>
                  </div>
                );
              }

              const technicianIdCardUrl = getTechnicianIdCardUrl(technicianId, selectedIdCardBrand);
              const qrCodeImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encodeURIComponent(technicianIdCardUrl)}`;
              const brandLabel = getDocumentBrandLabel(selectedIdCardBrand);

              return (
                <div className="flex w-full flex-col items-center gap-4">
                  <div className="bg-white p-4 rounded-lg border-2 border-gray-200 shadow-lg">
                    <img
                      key={selectedIdCardBrand}
                      src={qrCodeImageUrl}
                      alt={`${brandLabel} technician ID card QR code`}
                      className="w-64 h-64 object-contain"
                      onError={(e) => {
                        console.error('QR code image failed to load:', qrCodeImageUrl);
                        e.currentTarget.style.display = 'none';
                        const parent = e.currentTarget.parentElement;
                        if (parent) {
                          parent.innerHTML =
                            '<div class="text-center py-8 text-gray-600">QR code image not available</div>';
                        }
                      }}
                    />
                  </div>
                  {user?.fullName && (
                    <div className="text-center">
                      <p className="font-semibold text-gray-900">{user.fullName}</p>
                      {user?.employeeId && (
                        <p className="text-sm text-gray-600">ID: {user.employeeId}</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
          <DialogFooter>
            <Button onClick={() => setTechnicianIdCardDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={commonQrDialogOpen} onOpenChange={setCommonQrDialogOpen}>
        <DialogContent className="max-h-[90vh] w-[95vw] max-w-lg overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="w-5 h-5" />
              Common QR{commonQrCodesForTechnician.length > 1 ? 's' : ''}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto py-4 -mx-2 px-2">
            {commonQrCodesForTechnician.length > 0 ? (
              <>
                {/* Mobile: horizontal scroll - tap to expand */}
                <div className="flex gap-4 overflow-x-auto overflow-y-hidden pb-2 snap-x snap-mandatory sm:hidden">
                  {commonQrCodesForTechnician.map((qr) => (
                    <button
                      key={qr.id}
                      type="button"
                      onClick={() => setExpandedCommonQr(qr)}
                      className="flex min-w-[140px] shrink-0 snap-center flex-col items-center gap-2 rounded-lg border border-gray-200 bg-white p-3 transition-colors hover:border-primary/50 hover:bg-gray-50 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      <img
                        src={appendQrCacheBust(
                          commonQrDisplaySrc(qr.id, qr.qrCodeUrl, commonQrImageDataById),
                          qrAssetsVersion
                        )}
                        alt={qr.name}
                        className="h-32 w-32 object-contain"
                      />
                      <p className="text-sm font-medium text-gray-900 truncate w-full text-center">{qr.name}</p>
                    </button>
                  ))}
                </div>
                {/* Tablet/desktop: grid - click to expand */}
                <div className="hidden sm:grid sm:grid-cols-2 md:grid-cols-3 gap-4 justify-items-center">
                  {commonQrCodesForTechnician.map((qr) => (
                    <button
                      key={qr.id}
                      type="button"
                      onClick={() => setExpandedCommonQr(qr)}
                      className="flex flex-col items-center gap-2 rounded-lg border border-gray-200 bg-white p-3 w-full max-w-[180px] transition-colors hover:border-primary/50 hover:bg-gray-50 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      <img
                        src={appendQrCacheBust(
                          commonQrDisplaySrc(qr.id, qr.qrCodeUrl, commonQrImageDataById),
                          qrAssetsVersion
                        )}
                        alt={qr.name}
                        className="h-36 w-36 object-contain md:h-40 md:w-40"
                      />
                      <p className="text-sm font-medium text-gray-900 truncate w-full text-center">{qr.name}</p>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-center py-8">
                <QrCode className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-600">No common QR assigned</p>
                <p className="text-sm text-gray-500 mt-2">Ask admin to assign in Settings → Technician Management → Common QR</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setCommonQrDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Expanded Common QR - tap/click any Common QR to open large */}
      <Dialog open={!!expandedCommonQr} onOpenChange={(open) => !open && setExpandedCommonQr(null)}>
        <DialogContent className="max-w-sm overflow-hidden p-6">
          {expandedCommonQr && (
            <>
              <DialogHeader>
                <DialogTitle className="text-center text-lg">{expandedCommonQr.name}</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col items-center gap-4 py-2">
                <div className="rounded-xl border-2 border-border bg-white p-4 shadow-inner">
                  <img
                    src={appendQrCacheBust(
                      commonQrDisplaySrc(
                        expandedCommonQr.id,
                        expandedCommonQr.qrCodeUrl,
                        commonQrImageDataById
                      ),
                      qrAssetsVersion
                    )}
                    alt={expandedCommonQr.name}
                    className="h-56 w-56 object-contain sm:h-64 sm:w-64"
                  />
                </div>
              </div>
              <DialogFooter className="flex sm:justify-center">
                <Button onClick={() => setExpandedCommonQr(null)} variant="outline">Close</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Monthly Billing Dialog */}
      <Dialog open={billingDialogOpen} onOpenChange={setBillingDialogOpen}>
        <DialogContent className="w-[95vw] max-w-sm p-0 overflow-hidden">
          <DialogHeader className="px-4 pt-4 pb-2">
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="w-5 h-5" />
              My Billing
            </DialogTitle>
          </DialogHeader>

          {/* Month navigation */}
          <div className="flex items-center justify-between px-4 py-2 border-y bg-gray-50">
            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-9 p-0"
              onClick={() =>
                setBillingMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
              }
              aria-label="Previous month"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <div className="text-sm font-semibold text-gray-900">
              {billingMonthLabel}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-9 p-0"
              onClick={() =>
                setBillingMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
              }
              disabled={isBillingCurrentMonth}
              aria-label="Next month"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          {/* Total only */}
          <div className="px-4 py-6">
            <div className="rounded-lg bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 p-5 text-center">
              <div className="text-xs font-medium text-blue-700 uppercase tracking-wide">
                Total Billing
              </div>
              {billingLoading ? (
                <div className="mt-3 flex items-center justify-center h-10">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-700"></div>
                </div>
              ) : (
                <div className="mt-2 flex items-center justify-center gap-1 text-blue-900">
                  <IndianRupee className="w-6 h-6" />
                  <span className="text-3xl font-bold">
                    {billingTotalAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="px-4 py-3 border-t bg-white">
            <Button onClick={() => setBillingDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TechnicianCustomerUpdateDialog
        open={customerUpdateDialogJob !== null}
        onOpenChange={(open) => {
          if (!open) setCustomerUpdateDialogJob(null);
        }}
        job={customerUpdateDialogJob}
        onSaved={patchJobCustomerInState}
      />
    </div>
  );
};

export default TechnicianDashboard;
