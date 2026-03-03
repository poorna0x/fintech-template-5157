import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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
  Package
} from 'lucide-react';
import { toast } from 'sonner';
import { db, supabase } from '@/lib/supabase';
import { Job, JobAssignmentRequest } from '@/types';
import { sendNotification, createJobCompletedNotification, createJobAssignmentRequestNotification, createJobAssignmentAcceptedNotification, createJobAssignmentRejectedNotification, requestNotificationPermission } from '@/lib/notifications';
import FollowUpModal from '@/components/FollowUpModal';
import { registerTechnicianPWA, disablePWA } from '@/lib/pwa';
import { getCachedQrCodes, cacheQrCodes, shouldUseCache, getCachedTechnicianQrCode, cacheTechnicianQrCode, CommonQrCode } from '@/lib/qrCodeManager';
import { extractCoordinates, formatAddressForDisplay } from '@/lib/maps';
import ImageUpload from '@/components/ImageUpload';
import { Label } from '@/components/ui/label';
import { processQueuedPhotos, startRetryProcessing, setupOnlineListener, stopRetryProcessing } from '@/lib/retryPhotoUpload';
import { getQueuedPhotosCount } from '@/lib/offlinePhotoQueue';
import { saveJobCompletionProgress, getQueuedCompletionForJob } from '@/lib/offlineJobCompletion';
import { withTimeout, isSlowNetworkError, isTimeoutError } from '@/lib/networkTimeout';
import TechnicianInventoryView from '@/components/TechnicianInventoryView';
import JobPartsUsedDialog from '@/components/admin/JobPartsUsedDialog';
import { AddReminderDialog } from '@/components/reminders/AddReminderDialog';
import { bangaloreAreas } from '@/lib/adminUtils';

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

const TechnicianDashboard = () => {
  const { user, logout, isTechnician, loading } = useAuth();
  const navigate = useNavigate();
  
  const [jobs, setJobs] = useState<Job[]>([]);
  const [filteredJobs, setFilteredJobs] = useState<Job[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false); // Start as false to prevent flash
  const [customerAMCStatus, setCustomerAMCStatus] = useState<Record<string, boolean>>({}); // Map customer ID to hasActiveAMC
  const [amcInfoDialogOpen, setAmcInfoDialogOpen] = useState(false);
  const [selectedCustomerForAMC, setSelectedCustomerForAMC] = useState<{id: string, name: string} | null>(null);
  const [amcInfo, setAmcInfo] = useState<any>(null);
  const [loadingAMCInfo, setLoadingAMCInfo] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const processingJobsRef = useRef<Set<string>>(new Set()); // Track jobs being processed to prevent duplicates (use ref for synchronous access)
  const lastActiveTimeRef = useRef<Date>(new Date()); // Track when app was last active
  const lastJobIdsRef = useRef<Set<string>>(new Set()); // Track job IDs from last active session
  const hasJobsRef = useRef<boolean>(false); // Track if we have loaded jobs at least once
  const shouldPreserveOrderRef = useRef<boolean>(false); // Track if we should preserve job order (true when updating status, false when loading from DB)
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
  const [confirmStartJobDialog, setConfirmStartJobDialog] = useState<{open: boolean, job: Job | null}>({open: false, job: null});
  const [confirmStartWorkDialog, setConfirmStartWorkDialog] = useState<{open: boolean, job: Job | null}>({open: false, job: null});
  const [confirmCompleteJobDialog, setConfirmCompleteJobDialog] = useState<{open: boolean, job: Job | null}>({open: false, job: null});
  const [statusFilter, setStatusFilter] = useState<'ONGOING' | 'PENDING' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'RESCHEDULED'>('ONGOING');
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
  // Customer report dialog state
  const [customerReportDialogOpen, setCustomerReportDialogOpen] = useState(false);
  const [selectedCustomerForReport, setSelectedCustomerForReport] = useState<any>(null);
  const [customerReportJobs, setCustomerReportJobs] = useState<any[]>([]);
  const [loadingCustomerReportJobs, setLoadingCustomerReportJobs] = useState(false);
  // Photo viewer state for customer report
  const [photoViewerOpen, setPhotoViewerOpen] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<{url: string, index: number, total: number} | null>(null);
  const [selectedBillPhotos, setSelectedBillPhotos] = useState<string[]>([]);
  const [partsUsedDialogOpen, setPartsUsedDialogOpen] = useState(false);
  const [selectedJobForParts, setSelectedJobForParts] = useState<Job | null>(null);
  const [addReminderDialogOpen, setAddReminderDialogOpen] = useState(false);
  const [reminderEntity, setReminderEntity] = useState<{ type: 'customer' | 'job' | 'general'; id: string | null }>({ type: 'general', id: null });
  const [reminderContextLabel, setReminderContextLabel] = useState<string>('');
  useEffect(() => {
    registerTechnicianPWA();
    
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
  const [paymentPhotos, setPaymentPhotos] = useState<string[]>([]);
  const [otpInput, setOtpInput] = useState<string[]>(['', '', '', '']);
  const [otpError, setOtpError] = useState<string>('');
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [amcDateGiven, setAmcDateGiven] = useState<string>('');
  const [amcEndDate, setAmcEndDate] = useState<string>('');
  const [amcYears, setAmcYears] = useState<number>(0);
  const [amcIncludesPrefilter, setAmcIncludesPrefilter] = useState<boolean>(false);
  const [amcAdditionalInfo, setAmcAdditionalInfo] = useState<string>('');
  const [amcAmount, setAmcAmount] = useState<string>('');
  const [hasAMC, setHasAMC] = useState<boolean | null>(null);
  const [paymentMode, setPaymentMode] = useState<'CASH' | 'ONLINE' | 'PARTIAL' | ''>('');
  const [billAmountConfirmOpen, setBillAmountConfirmOpen] = useState(false);
  const [customerHasPrefilter, setCustomerHasPrefilter] = useState<boolean | null>(null);
  const [rawWaterTds, setRawWaterTds] = useState<string>('');
  const [qrCodeType, setQrCodeType] = useState<string>('');
  const [selectedQrCodeId, setSelectedQrCodeId] = useState<string>('');
  const [commonQrCodes, setCommonQrCodes] = useState<CommonQrCode[]>([]);
  const [allCommonQrCodes, setAllCommonQrCodes] = useState<CommonQrCode[]>([]); // Store all QR codes
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [allTechnicians, setAllTechnicians] = useState<any[]>([]); // Store all technicians (filtered for QR codes)
  const [allTechniciansForReports, setAllTechniciansForReports] = useState<any[]>([]); // Store ALL technicians for reports lookup
  const [technicianVisibleQrCodes, setTechnicianVisibleQrCodes] = useState<string[]>([]); // Current technician's visibility settings
  const [paymentScreenshot, setPaymentScreenshot] = useState<string>('');
  const [partialCashAmount, setPartialCashAmount] = useState<string>('');
  const [partialOnlineAmount, setPartialOnlineAmount] = useState<string>('');
  const [isSubmittingJobCompletion, setIsSubmittingJobCompletion] = useState(false);
  const [isBillPhotosUploading, setIsBillPhotosUploading] = useState(false);
  const [isPaymentScreenshotUploading, setIsPaymentScreenshotUploading] = useState(false);

  // Phone popup state
  const [phonePopupOpen, setPhonePopupOpen] = useState(false);
  const [selectedCustomerPhone, setSelectedCustomerPhone] = useState<{phone: string, alternate_phone?: string, full_name?: string} | null>(null);

  // Technician ID Card QR Code Dialog
  const [technicianIdCardDialogOpen, setTechnicianIdCardDialogOpen] = useState(false);
  const [inventoryDialogOpen, setInventoryDialogOpen] = useState(false);
  // Common QRs (assigned by admin, shown below payment QR) - multiple allowed
  const [commonQrCodesForTechnician, setCommonQrCodesForTechnician] = useState<CommonQrCode[]>([]);
  const [commonQrDialogOpen, setCommonQrDialogOpen] = useState(false);
  const [expandedCommonQr, setExpandedCommonQr] = useState<CommonQrCode | null>(null);

  // Photos dialog state
  const [photosDialogOpen, setPhotosDialogOpen] = useState(false);
  const [selectedJobPhotos, setSelectedJobPhotos] = useState<{jobId: string, photos: string[], customerId?: string} | null>(null);
  const [loadingCustomerPhotos, setLoadingCustomerPhotos] = useState(false);

  // Address dialog state
  const [addressDialogOpen, setAddressDialogOpen] = useState<{[jobId: string]: boolean}>({});
  const [selectedJobForAddress, setSelectedJobForAddress] = useState<Job | null>(null);

  // Define loadAssignedJobs before useEffect hooks that use it
  const loadAssignedJobs = useCallback(async (retryCount = 0) => {
    if (!user?.technicianId) return;

    try {
      // Only show loading if we haven't loaded jobs before (first load)
      if (!hasJobsRef.current) {
        setJobsLoading(true);
      }
      console.time('loadAssignedJobs'); // Performance timing
      
      // Use proper timeout handling - only timeout if request actually takes too long
      // The Supabase client already has a 30s timeout, so we don't need an additional timeout here
      // Just let the request complete naturally - if it's fast, it will be fast; if it's slow, Supabase will timeout
      const { data, error } = await db.jobs.getByTechnicianId(user.technicianId);
      console.timeEnd('loadAssignedJobs'); // Performance timing
      
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

      // All jobs go to regular jobs list (ASSIGNED jobs will show with blue border in the list)
      const allJobs: Job[] = [];
      const newAssignedJobs: Job[] = [];
      const statusCounts: Record<string, number> = {};
      
      if (data && data.length > 0) {
        data.forEach((job: Job) => {
          const status = (job as any).status || job.status || 'UNKNOWN';
          allJobs.push(job);
          
          // Count jobs by status
          statusCounts[status] = (statusCounts[status] || 0) + 1;
          
          // Track ASSIGNED jobs for notifications
          if (status === 'ASSIGNED') {
            newAssignedJobs.push(job);
          }
        });
      }
      
      // Calculate ongoing jobs count (PENDING, ASSIGNED, EN_ROUTE, IN_PROGRESS)
      const ongoingJobs = allJobs.filter(job => {
        const status = (job as any).status || job.status;
        return ['PENDING', 'ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS'].includes(status);
      });
      
      console.log(`📊 Jobs loaded from database: ${data?.length || 0} total`, {
        ongoing: ongoingJobs.length,
        statusBreakdown: statusCounts
      });
      
      // Mark that we should sort (loading from database)
      shouldPreserveOrderRef.current = false;
      setJobs(allJobs);
      jobsRef.current = allJobs; // Update ref for synchronous access
      hasJobsRef.current = true; // Mark that we've loaded jobs at least once
      setJobsLoading(false); // Show jobs immediately, don't wait for AMC
      
      // Load AMC status in background (non-blocking) - defer for mobile performance
      if (data && data.length > 0) {
        // Use setTimeout to defer AMC loading - don't block UI
        setTimeout(async () => {
          try {
            const customerIds = data.map((job: any) => job.customer_id || (job.customer as any)?.id).filter(Boolean);
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
      
      // Check for new jobs when app becomes active (only if we have previous job IDs to compare)
      if (lastJobIdsRef.current.size > 0) {
        const currentJobIds = new Set(allJobs.map(j => j.id));
        const newJobIds = Array.from(currentJobIds).filter(id => !lastJobIdsRef.current.has(id));
        const newAssignedJobs = allJobs.filter(j => 
          newJobIds.includes(j.id) && 
          ((j as any).status || j.status) === 'ASSIGNED'
        );
        
        // Removed toast notification - jobs will show with blue border and NEW tag
      }
      
      // Update last job IDs for next comparison
      lastJobIdsRef.current = new Set(allJobs.map(j => j.id));
    } catch (error) {
      console.error('Error loading assigned jobs:', error);
      // Don't show toast messages for timeout/network issues - these are transient and will retry automatically
      // Only log to console for debugging
    } finally {
      setJobsLoading(false);
    }
  }, [user?.technicianId]);

  // Redirect if not technician
  useEffect(() => {
    console.log('TechnicianDashboard: Checking auth status...', { isTechnician, user, loading, userRole: user?.role });
    
    // Only redirect if loading is complete and user is not a technician
    // Wait for loading to complete before checking auth status
    if (!loading) {
      // If no user or user is not a technician, redirect to login
      if (!user || user.role !== 'technician') {
        console.log('Not a technician, redirecting to login...', { user, isTechnician, userRole: user?.role });
        navigate('/technician/login', { replace: true });
      }
    }
  }, [isTechnician, navigate, user, loading]);

  // Load assigned jobs and assignment requests
  useEffect(() => {
    if (user?.technicianId) {
      loadAssignedJobs();
      loadAssignmentRequests();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.technicianId, loadAssignedJobs]);

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

  // Load QR codes function (extracted so it can be called manually)
  const loadQrCodes = useCallback(async () => {
      // Only load if user is a technician
      if (!user) {
        console.log('⚠️ No user found, skipping QR code load');
        return;
      }

      if (user.role !== 'technician') {
        console.log('⚠️ User is not a technician, skipping QR code load. Role:', user.role);
        return;
      }

      // Get technician ID - use technicianId if available, otherwise use user.id
      const technicianId = user.technicianId || user.id;
      console.log('✅ Loading QR codes for technician:', { 
        userId: user.id, 
        technicianId: user.technicianId, 
        usingId: technicianId,
        email: user.email,
        fullName: user.fullName
      });

      try {
        // Check cache first (for mobile)
        if (shouldUseCache()) {
          const cachedCommon = getCachedQrCodes();
          if (cachedCommon) {
            setCommonQrCodes(cachedCommon);
          }
          
        }

        // Always fetch from database (cache will be updated)
        // OPTIMIZATION: Limit technicians fetch. Common QR (non-payment) from technician_common_qr.
        const [commonResult, allTechniciansResult, technicianCommonQrResult] = await Promise.all([
          db.commonQrCodes.getAll(),
          db.technicians.getAll(100),
          db.technicianCommonQr.getAll()
        ]);

        // Transform common QR codes
        let allCommonQrCodesData: CommonQrCode[] = [];
        if (commonResult.data) {
          allCommonQrCodesData = commonResult.data.map((qr: any) => ({
            id: qr.id,
            name: qr.name,
            qrCodeUrl: qr.qr_code_url,
            createdAt: qr.created_at,
            updatedAt: qr.updated_at
          }));
          setAllCommonQrCodes(allCommonQrCodesData);
          
          // Update cache
          if (shouldUseCache()) {
            cacheQrCodes(allCommonQrCodesData);
          }
        }

        // Transform technicians with QR codes
        let allTechniciansData: any[] = [];
        let currentTechnicianVisibleQrCodes: string[] = ['all']; // Default to showing all (backward compatibility)
        let rawVisibleQrCodes: any = null; // Store raw value to distinguish null/undefined from empty array
        
        if (allTechniciansResult.data) {
          // Store ALL technicians for reports lookup (not filtered)
          const allTechniciansForReportsData = allTechniciansResult.data.map((tech: any) => ({
            id: tech.id,
            fullName: tech.full_name,
            full_name: tech.full_name // Keep both for compatibility
          }));
          setAllTechniciansForReports(allTechniciansForReportsData);
          
          // Filter only those with QR codes for QR code selection
          allTechniciansData = allTechniciansResult.data
            .filter((tech: any) => tech.qr_code && tech.qr_code.trim() !== '')
            .map((tech: any) => ({
              id: tech.id,
              fullName: tech.full_name,
              qrCode: tech.qr_code,
              visibleQrCodes: tech.visible_qr_codes || []
            }));
          
          setAllTechnicians(allTechniciansData);
          
          // Get current technician's visibility settings
          const currentTech = allTechniciansResult.data.find((tech: any) => tech.id === technicianId);
          // If visible_qr_codes is null/undefined, default to showing all (backward compatibility)
          // If it's an empty array [], that means explicitly set to show none
          rawVisibleQrCodes = currentTech?.visible_qr_codes;
          currentTechnicianVisibleQrCodes = rawVisibleQrCodes === null || rawVisibleQrCodes === undefined ? ['all'] : rawVisibleQrCodes;
          setTechnicianVisibleQrCodes(currentTechnicianVisibleQrCodes);
          // Common QRs (non-payment) assigned to this technician - from technician_common_qr table (multiple allowed)
          const commonQrIds: string[] = Array.isArray(currentTech?.common_qr_code_ids)
            ? currentTech.common_qr_code_ids
            : (currentTech?.common_qr_code_id ? [currentTech.common_qr_code_id] : []);
          const technicianCommonQrList: CommonQrCode[] = (technicianCommonQrResult.data || []).map((q: any) => ({
            id: q.id,
            name: q.name,
            qrCodeUrl: q.qr_code_url,
            createdAt: q.created_at,
            updatedAt: q.updated_at
          }));
          const assigned = technicianCommonQrList.filter((q: CommonQrCode) => commonQrIds.includes(q.id));
          setCommonQrCodesForTechnician(assigned);
          
          // Cache current technician's QR code if available
          const currentTechWithQr = allTechniciansData.find(t => t.id === technicianId);
          if (currentTechWithQr && shouldUseCache()) {
            cacheTechnicianQrCode(technicianId, currentTechWithQr.qrCode);
          }
        }

        // Filter QR codes based on visibility settings
        // If visibleQrCodes is null/undefined → show all (default, backward compatibility)
        // If visibleQrCodes is empty array [] → show none (explicitly set to none)
        // If visibleQrCodes includes 'all' → show all
        // Otherwise → show only the specified QR codes
        
        if (currentTechnicianVisibleQrCodes.length === 0 && rawVisibleQrCodes !== null && rawVisibleQrCodes !== undefined) {
          // Empty array (explicitly set) = show none
          setCommonQrCodes([]);
          setTechnicians([]);
          console.log('✅ QR code visibility: None (explicitly set to empty array)');
        } else if (currentTechnicianVisibleQrCodes.includes('all')) {
          // 'all' = show everything
          setCommonQrCodes(allCommonQrCodesData);
          setTechnicians(allTechniciansData);
          console.log('✅ QR code visibility: All', { common: allCommonQrCodesData.length, technicians: allTechniciansData.length });
        } else {
          // Specific IDs = filter
          // Ensure all IDs are strings for comparison
          const visibleQrCodesStr = currentTechnicianVisibleQrCodes.map(id => String(id));
          
          console.log('🔍 Filtering QR codes:', {
            visibleQrCodes: visibleQrCodesStr,
            allCommonQrCodes: allCommonQrCodesData.map(qr => ({ id: qr.id, name: qr.name, formattedId: `common_${String(qr.id)}` })),
            allTechnicians: allTechniciansData.map(tech => ({ id: tech.id, name: tech.fullName, formattedId: `technician_${String(tech.id)}` }))
          });
          
          const filteredCommon = allCommonQrCodesData.filter(qr => {
            const formattedId = `common_${String(qr.id)}`;
            const isIncluded = visibleQrCodesStr.includes(formattedId);
            console.log(`  Checking common QR ${qr.name}: ${formattedId} -> ${isIncluded ? '✅' : '❌'}`);
            return isIncluded;
          });
          
          const filteredTechnicians = allTechniciansData.filter(tech => {
            const formattedId = `technician_${String(tech.id)}`;
            const isIncluded = visibleQrCodesStr.includes(formattedId);
            console.log(`  Checking technician QR ${tech.fullName}: ${formattedId} -> ${isIncluded ? '✅' : '❌'}`);
            return isIncluded;
          });
          
          setCommonQrCodes(filteredCommon);
          setTechnicians(filteredTechnicians);
          console.log('✅ QR code visibility: Specific', { 
            visible: visibleQrCodesStr,
            common: filteredCommon.length, 
            technicians: filteredTechnicians.length,
            filteredCommon: filteredCommon.map(qr => qr.name),
            filteredTechnicians: filteredTechnicians.map(tech => tech.fullName)
          });
        }
      } catch (error) {
        console.error('Error loading QR codes:', error);
      }
    }, [user]);

  // Load QR codes on mount and when user changes
  useEffect(() => {
    console.log('🔍 QR Code useEffect triggered', { 
      hasUser: !!user, 
      userRole: user?.role,
      userId: user?.id,
      technicianId: user?.technicianId,
      loading: loading
    });

    // Wait for auth to finish loading
    if (loading) {
      console.log('⏳ Auth still loading, waiting...');
      return;
    }

    // Always try to load if user exists and auth is done loading (will check role inside)
    if (user) {
      console.log('🚀 Calling loadQrCodes, user:', { id: user.id, role: user.role });
      loadQrCodes();
    } else {
      console.log('⚠️ No user, not loading QR codes');
    }
  }, [user, loading, loadQrCodes]);

  // Track app visibility to show notifications when app becomes active and refresh QR codes
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // App became active - update last active time
        const now = new Date();
        const timeSinceLastActive = now.getTime() - lastActiveTimeRef.current.getTime();
        
        // Reload QR codes when page becomes visible (to get latest visibility settings)
        if (user && user.role === 'technician') {
          console.log('🔄 Page visible, refreshing QR codes...');
          loadQrCodes();
        }
        
        // Only check for new jobs if app was inactive for more than 5 seconds
        if (timeSinceLastActive > 5000 && user?.technicianId) {
          // Reload jobs to check for new assignments
          loadAssignedJobs();
        }
        
        lastActiveTimeRef.current = now;
      }
    };

    // Also track focus events (when user switches back to tab/window)
    const handleFocus = () => {
      const now = new Date();
      const timeSinceLastActive = now.getTime() - lastActiveTimeRef.current.getTime();
      
      if (timeSinceLastActive > 5000 && user?.technicianId) {
        loadAssignedJobs();
      }
      
      lastActiveTimeRef.current = now;
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [user?.technicianId, loadAssignedJobs, user, loadQrCodes]);

  // Periodic refresh of QR codes (every 30 seconds) to catch visibility setting changes
  useEffect(() => {
    if (!user || user.role !== 'technician') {
      return;
    }

    const interval = setInterval(() => {
      console.log('🔄 Periodic QR code refresh...');
      loadQrCodes();
    }, 30000); // Refresh every 30 seconds

    return () => {
      clearInterval(interval);
    };
  }, [user, loadQrCodes]);

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

  // Fetch customer jobs when report dialog opens
  useEffect(() => {
    const fetchCustomerReportJobs = async () => {
      if (!customerReportDialogOpen || !selectedCustomerForReport) {
        setCustomerReportJobs([]);
        return;
      }

      setLoadingCustomerReportJobs(true);
      try {
        const customerId = selectedCustomerForReport.id || selectedCustomerForReport.customer_id;
        if (customerId) {
          const { data, error } = await db.jobs.getByCustomerId(customerId);
          if (error) {
            console.error('Error fetching customer jobs for report:', error);
            setCustomerReportJobs([]);
          } else {
            setCustomerReportJobs(data || []);
          }
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

  // Single realtime channel with server-side filter (assigned_technician_id=me) to cut list_changes WAL load
  useEffect(() => {
    if (!user?.technicianId) return;

    const technicianId = user.technicianId;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let retryTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let retryCount = 0;
    const maxRetries = 3;
    const retryDelay = 2000;
    const isMounted = { current: true };

    const setupSubscription = () => {
      if (!isMounted.current) return;
      if (channel) {
        try {
          supabase.removeChannel(channel);
        } catch (_) {}
        channel = null;
      }

      channel = supabase
        .channel(`technician-jobs-${technicianId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'jobs',
            filter: `assigned_technician_id=eq.${technicianId}`,
          },
        async (payload) => {
          if (!isMounted.current) return;
          const updatedJob = payload.new as any;
          if (processingJobsRef.current.has(updatedJob.id)) return;

          processingJobsRef.current.add(updatedJob.id);
          try {
            const { data: fullJob, error } = await db.jobs.getById(updatedJob.id);
            if (!isMounted.current) return;
            if (error || !fullJob) {
              processingJobsRef.current.delete(updatedJob.id);
              return;
            }
            const currentJobsState = jobsRef.current;
            const jobInList = currentJobsState.find((j) => j.id === updatedJob.id);
            if (updatedJob.status === 'COMPLETED') {
              if (jobInList) {
                setJobs((prev) => {
                  const filtered = prev.filter((j) => j.id !== updatedJob.id);
                  jobsRef.current = filtered;
                  return filtered;
                });
              }
            } else if (!jobInList) {
              setJobs((prev) => {
                if (prev.some((j) => j.id === fullJob.id)) return prev;
                const next = [fullJob, ...prev];
                jobsRef.current = next;
                return next;
              });
            } else {
              setJobs((prev) => {
                const idx = prev.findIndex((j) => j.id === fullJob.id);
                if (idx < 0) return prev;
                const next = [...prev];
                next[idx] = fullJob;
                shouldPreserveOrderRef.current = true;
                jobsRef.current = next;
                return next;
              });
            }
          } finally {
            processingJobsRef.current.delete(updatedJob.id);
          }
        }
      )
        .subscribe((status, err) => {
          if (!isMounted.current) return;
          if (err) {
            if (retryCount < maxRetries) {
              retryCount++;
              retryTimeoutId = setTimeout(setupSubscription, retryDelay);
            } else {
              setRealtimeConnected(false);
            }
            return;
          }
          if (status === 'SUBSCRIBED') {
            retryCount = 0;
            setRealtimeConnected(true);
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            setRealtimeConnected(false);
            if (retryCount < maxRetries) {
              retryCount++;
              retryTimeoutId = setTimeout(setupSubscription, retryDelay);
            }
          }
        });
    };

    setupSubscription();

    return () => {
      isMounted.current = false;
      if (retryTimeoutId) clearTimeout(retryTimeoutId);
      if (channel) {
        try {
          supabase.removeChannel(channel);
        } catch (_) {}
      }
    };
  }, [user?.technicianId]);

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
  const getCurrentLocation = useCallback(async () => {
    console.log('📍 [TechnicianDashboard] getCurrentLocation called');
    
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
              const errorMsg = `Location captured but failed to upload to server. Please check your internet connection and try again. Error: ${error.message}`;
              setLocationError(errorMsg);
              setLocationErrorType('upload');
              toast.error(errorMsg, { duration: 8000 });
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
            const errorMsg = `Location captured but failed to upload to server. Please check your internet connection and try again. Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
            setLocationError(errorMsg);
            setLocationErrorType('upload');
            toast.error(errorMsg, { duration: 8000 });
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
      const customerLocation = job.serviceLocation as any;
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
      const customerLocation = job?.customer?.location;
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

  // Periodic refresh to catch changes from other technicians
  useEffect(() => {
    if (!user?.technicianId) return;

    const interval = setInterval(() => {
      // Only refresh if there are pending assignment requests
      if (assignmentRequests.length > 0) {
        loadAssignmentRequests();
      }
    }, 5000); // Check every 5 seconds

    return () => clearInterval(interval);
  }, [user?.technicianId, assignmentRequests.length]);

  // Polling: 5s when realtime is down; 30s when realtime is up (sync team_members + unassignments not in filtered channel)
  useEffect(() => {
    if (!user?.technicianId) return;

    const intervalMs = realtimeConnected ? 30000 : 5000;
    const pollInterval = setInterval(() => loadAssignedJobs(), intervalMs);
    return () => clearInterval(pollInterval);
  }, [user?.technicianId, realtimeConnected]);

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
      console.log('🚫 [TechnicianDashboard] - No visibility change updates');
      return;
    }
    
    console.log('✅ [TechnicianDashboard] Location tracking ENABLED - setting up periodic updates');

    // Update location immediately on mount (only if page is visible)
    if (!document.hidden) {
      console.log('🔄 [TechnicianDashboard] Page visible on mount - triggering initial location update');
      getCurrentLocation();
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
        getCurrentLocation();
      } else if (!stillEnabled) {
        console.log('🚫 [TechnicianDashboard] Location tracking was disabled - stopping interval updates');
      }
    }, 5 * 60 * 1000); // 5 minutes

    // Also listen for visibility changes to update when app becomes visible again
    const handleVisibilityChange = () => {
      const stillEnabled = localStorage.getItem('technician_location_tracking_enabled') !== 'false';
      console.log('👁️ [TechnicianDashboard] Visibility change:', {
        hidden: document.hidden,
        stillEnabled,
        willUpdate: !document.hidden && user?.technicianId && stillEnabled
      });
      
      if (!document.hidden && user?.technicianId && stillEnabled) {
        console.log('🔄 [TechnicianDashboard] Page became visible - triggering location update');
        getCurrentLocation();
      } else if (!stillEnabled) {
        console.log('🚫 [TechnicianDashboard] Location tracking disabled - skipping visibility update');
      }
    };

    // Listen for storage changes (when setting is toggled in Settings page - cross-tab)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'technician_location_tracking_enabled') {
        const isEnabled = e.newValue !== 'false';
        if (isEnabled && !document.hidden && user?.technicianId) {
          console.log('Location tracking enabled - requesting location update');
          getCurrentLocation();
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
        getCurrentLocation();
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
    };
  }, [user?.technicianId, getCurrentLocation]);

  // Filter jobs based on status
  useEffect(() => {
    let filtered = jobs;

    // Filter by status
    if (statusFilter === 'ONGOING') {
      // Show ongoing jobs (pending, assigned, en_route, in-progress)
      filtered = filtered.filter(job => {
        const status = (job as any).status || job.status;
        return ['PENDING', 'ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS'].includes(status);
      });
    } else if (statusFilter === 'RESCHEDULED') {
      // Filter for follow-up jobs (FOLLOW_UP status)
      filtered = filtered.filter(job => job.status === 'FOLLOW_UP');
    } else if (statusFilter === 'CANCELLED') {
      // Filter for denied jobs (DENIED status) - only show jobs denied by this technician today
      const technicianName = user?.fullName || '';
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Start of today
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1); // Start of tomorrow
      
      filtered = filtered.filter(job => {
        if (job.status !== 'DENIED') return false;
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
        const status = (job as any).status || job.status;
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
        const status = (job as any).status || job.status;
        return status === statusFilter;
      });
    }

    // Sort jobs: Follow-up jobs scheduled for today first, then NEW jobs, then IN_PROGRESS/EN_ROUTE, then others
    // Only sort if we loaded from database (not when updating status in place)
    if (!shouldPreserveOrderRef.current) {
      if (statusFilter === 'COMPLETED') {
        // Fast path: sort completed jobs by completed_at descending (newest first)
        filtered.sort((a, b) => {
          const ta = new Date((a as any).completed_at || (a as any).end_time || (a as any).completedAt || (a as any).endTime || 0).getTime();
          const tb = new Date((b as any).completed_at || (b as any).end_time || (b as any).completedAt || (b as any).endTime || 0).getTime();
          return tb - ta;
        });
      } else {
      filtered.sort((a, b) => {
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
    }
    
    // Reset the flag after processing
    shouldPreserveOrderRef.current = false;

    setFilteredJobs(filtered);
  }, [jobs, statusFilter, seenJobs, completedDateFilter, user?.technicianId, user?.id]);

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

  // Check if another job is in progress
  const hasJobInProgress = (): boolean => {
    return jobs.some(job => {
      const status = (job as any).status || job.status;
      return status === 'IN_PROGRESS' || status === 'EN_ROUTE';
    });
  };

  // Handle starting job (going to location) - EN_ROUTE status
  const handleStartJob = async (job: Job) => {
    if (!user?.technicianId) return;

    // Always show confirmation dialog
    setConfirmStartJobDialog({ open: true, job });
  };

  // Actually perform the start job action
  const performStartJob = async (job: Job) => {
    if (!user?.technicianId) return;

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
    } finally {
      setIsUpdating(false);
    }
  };

  // Handle starting work at location - IN_PROGRESS status
  const handleStartWork = async (job: Job) => {
    if (!user?.technicianId) return;

    // Show confirmation dialog
    setConfirmStartWorkDialog({ open: true, job });
  };

  // Actually perform the start work action
  const performStartWork = async (job: Job) => {
    if (!user?.technicianId) return;

    try {
      setIsUpdating(true);
      processingJobsRef.current.add(job.id);
      
      markJobAsSeen(job.id);

      // Update job status to IN_PROGRESS (at location, working)
      const { error } = await db.jobs.update(job.id, {
        status: 'IN_PROGRESS',
        start_time: new Date().toISOString(),
      });

      if (error) {
        throw new Error(error.message);
      }

      // Update local state - preserve order (don't re-sort)
      shouldPreserveOrderRef.current = true;
      setJobs(prev => prev.map(j => 
        j.id === job.id 
          ? { ...j, status: 'IN_PROGRESS' as any, start_time: new Date().toISOString() }
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

  // Handle completing job - opens completion dialog
  const handleCompleteJob = async (job: Job) => {
    // Show confirmation dialog first
    setConfirmCompleteJobDialog({ open: true, job });
  };

  // Actually open the completion dialog
  const performCompleteJob = async (job: Job) => {
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
    
    // Always reset to fresh defaults (don't restore saved progress)
      setCompletionNotes('');
      setCompleteJobStep(1);
      setBillAmount('');
      setBillPhotos([]);
      setPaymentPhotos([]);
      // Set default AMC date to today
      const today = new Date().toISOString().split('T')[0];
      setAmcDateGiven(today);
    setAmcYears(0);
    setAmcEndDate('');
      setAmcIncludesPrefilter(false);
    setHasAMC(null);
        setAmcAdditionalInfo('');
    setAmcAmount('');
        setPaymentScreenshot('');
        setPaymentMode('');
      setCustomerHasPrefilter(null);
      setRawWaterTds('');
      setQrCodeType('');
      setSelectedQrCodeId('');
      setOtpInput(['', '', '', '']);
      setOtpError('');
      otpInputRefs.current = [];
    
    // Initialize customerHasPrefilter from customer's existing value if available
    const customerPrefilter = jobWithCustomer.customer 
      ? ((jobWithCustomer.customer as any).has_prefilter ?? (jobWithCustomer.customer as any).hasPrefilter ?? null)
      : null;
    setCustomerHasPrefilter(customerPrefilter);
    // Only prefill if value > 0; empty by default so mobile users can easily type (0 is hard to clear)
    const existingTds = (jobWithCustomer.customer as any)?.raw_water_tds;
    setRawWaterTds(existingTds != null && Number(existingTds) > 0 ? String(existingTds) : '');
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
  }) => {
    try {
      // Update job status and follow-up info
      // Use technician's user ID (UUID) - database expects UUID, not name
      const { error: jobError } = await db.jobs.update(jobId, {
        status: 'FOLLOW_UP',
        follow_up_date: followUpData.followUpDate,
        follow_up_notes: followUpData.followUpReason || '',
        follow_up_scheduled_by: user?.id || null,
        follow_up_scheduled_at: new Date().toISOString()
      });

      if (jobError) {
        throw new Error(jobError.message);
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
      setJobs(prev => prev.map(job => 
        job.id === jobId 
          ? { 
              ...job, 
              status: 'FOLLOW_UP',
              followUpDate: followUpData.followUpDate,
              followUpNotes: followUpData.followUpReason || '',
              followUpScheduledBy: user?.id || 'technician',
              followUpScheduledAt: new Date().toISOString()
            }
          : job
      ));
      
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
    const billAmountNum = parseFloat(billAmount);
    return billAmount === '' || isNaN(billAmountNum) || billAmountNum === 0;
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
    const requirements = selectedJobForComplete.requirements || [];
    if (Array.isArray(requirements)) {
      return requirements.some((req: any) => req?.require_otp === true);
    }
    return false;
  };

  // Get OTP code from job requirements
  const getOtpCode = (): string | null => {
    if (!selectedJobForComplete) return null;
    const requirements = selectedJobForComplete.requirements || [];
    if (Array.isArray(requirements)) {
      const otpReq = requirements.find((req: any) => req?.require_otp === true);
      return otpReq?.otp_code || null;
    }
    return null;
  };

  const handleCompleteJobSubmit = async () => {
    if (!selectedJobForComplete) return;

    // Step 1: Bill Amount - validate and show confirmation
    if (completeJobStep === 1) {
      const billAmountNum = parseFloat(billAmount);
      if (!billAmount || isNaN(billAmountNum) || billAmountNum < 0) {
        toast.error('Please enter a valid bill amount');
        return;
      }
      // Save progress before showing confirmation
      saveJobCompletionProgress(selectedJobForComplete.id, {
        billPhotos,
        billAmount,
        currentStep: 1,
      });
      // Show confirmation dialog
      setBillAmountConfirmOpen(true);
      return;
    }

    // Step 2: Bill Photo (optional) - move to next step
    if (completeJobStep === 2) {
      // Check if we should skip AMC step (step 3)
      const billIsZero = isBillAmountZero();
      const isSoftener = isSoftenerService();
      const shouldSkipAMC = billIsZero || isSoftener;
      
      // Determine next step:
      // - If should skip AMC: go directly to step 4 (payment) or step 7 (OTP) or step 6 (prefilter/submit)
      // - If not skipping AMC: go to step 3 (AMC)
      const needsOtp = requiresOtp();
      let nextStep: 3 | 4 | 6 | 7 = 3;
      if (shouldSkipAMC) {
        if (billIsZero) {
          // Skip AMC and payment steps
          // If OTP required, go to step 7, otherwise go to prefilter (step 6) or submit if softener
          nextStep = needsOtp ? 7 : 6;
        } else {
          // Skip AMC but go to payment step (step 4)
          nextStep = 4;
        }
      }
      
      // Save progress before moving to next step
      saveJobCompletionProgress(selectedJobForComplete.id, {
        billPhotos,
        billAmount,
        currentStep: nextStep,
      });
      
      // If skipping AMC and bill is zero and softener, check OTP first
      if (shouldSkipAMC && billIsZero && isSoftener) {
        setHasAMC(false);
        setCustomerHasPrefilter(null);
        setRawWaterTds('');
        if (needsOtp) {
          setCompleteJobStep(7);
          return;
        } else {
          setCompleteJobStep(6);
          // Continue to submit logic - don't return here
        }
      } else {
        setCompleteJobStep(nextStep);
        return;
      }
    }

    // Step 3: AMC Information (optional, can skip) - move to next step
    if (completeJobStep === 3) {
      // Skip AMC step if bill is zero or service is softener (shouldn't reach here, but safety check)
      const billIsZeroStep3 = isBillAmountZero();
      const isSoftenerStep3 = isSoftenerService();
      if (billIsZeroStep3 || isSoftenerStep3) {
        // Auto-skip AMC and proceed
        setHasAMC(false);
        const nextStep = billIsZeroStep3 ? 6 : 4;
        saveJobCompletionProgress(selectedJobForComplete.id, {
          billPhotos,
          billAmount,
          paymentMode: billIsZeroStep3 ? '' : (paymentMode as 'CASH' | 'ONLINE' | ''),
          paymentScreenshot: billIsZeroStep3 ? '' : paymentScreenshot,
          qrCodeType: billIsZeroStep3 ? '' : qrCodeType,
          selectedQrCodeId: billIsZeroStep3 ? '' : selectedQrCodeId,
          customerHasPrefilter: billIsZeroStep3 && isSoftenerStep3 ? null : customerHasPrefilter,
          hasAMC: false,
          amcDateGiven: '',
          amcEndDate: '',
          amcYears: 0,
          amcIncludesPrefilter: false,
          amcAdditionalInfo: '',
          currentStep: nextStep,
        });
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
      
      // If years is 0, treat it as no AMC
      const effectiveHasAMC = hasAMC === true && amcYears > 0;
      
      // Check if bill amount is zero - if so, skip payment steps (4 and 5)
      const billIsZeroStep3Continue = isBillAmountZero();
      const needsOtp = requiresOtp();
      
      // Determine next step:
      // - If bill is zero: skip to step 7 (OTP) if required, or step 6 (prefilter) or submit if softener
      // - If bill is not zero: go to step 4 (payment mode)
      let nextStep: 4 | 6 | 7 = 4;
      const billIsZeroStep3Final = billIsZeroStep3Continue;
      if (billIsZeroStep3Final) {
        // Skip payment steps, check if OTP is required
        nextStep = needsOtp ? 7 : 6;
      }
      
      // Save progress (AMC is optional, can skip)
      saveJobCompletionProgress(selectedJobForComplete.id, {
        billPhotos,
        billAmount,
        paymentMode: billIsZeroStep3Final ? '' : (paymentMode as 'CASH' | 'ONLINE' | ''),
        paymentScreenshot: billIsZeroStep3Final ? '' : paymentScreenshot,
        qrCodeType: billIsZeroStep3Final ? '' : qrCodeType,
        selectedQrCodeId: billIsZeroStep3Final ? '' : selectedQrCodeId,
        customerHasPrefilter,
        hasAMC: effectiveHasAMC,
        amcDateGiven: effectiveHasAMC ? amcDateGiven : '',
        amcEndDate: effectiveHasAMC ? amcEndDate : '',
        amcYears: effectiveHasAMC ? amcYears : 0,
        amcIncludesPrefilter: effectiveHasAMC ? amcIncludesPrefilter : false,
        amcAdditionalInfo: effectiveHasAMC ? amcAdditionalInfo : '',
        currentStep: nextStep,
      });
      
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
    if (completeJobStep === 4) {
      // Skip payment step if bill amount is zero (shouldn't reach here, but safety check)
      if (isBillAmountZero()) {
        // Skip to step 7 (OTP) if required, or step 6 (prefilter) or submit if softener
        const isSoftener = isSoftenerService();
        const needsOtp = requiresOtp();
        saveJobCompletionProgress(selectedJobForComplete.id, {
          billPhotos,
          billAmount,
          paymentMode: '',
          paymentScreenshot: '',
          qrCodeType: '',
          selectedQrCodeId: '',
          customerHasPrefilter: isSoftener ? null : customerHasPrefilter,
          hasAMC: false,
          amcDateGiven: '',
          amcEndDate: '',
          amcYears: 0,
          amcIncludesPrefilter: false,
          amcAdditionalInfo: '',
          currentStep: needsOtp ? 7 : 6,
        });
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
      // Save progress
      saveJobCompletionProgress(selectedJobForComplete.id, {
        billPhotos,
        billAmount,
        paymentMode: paymentMode as 'CASH' | 'ONLINE' | '',
        amcDateGiven,
        amcEndDate,
        amcYears,
        amcIncludesPrefilter,
        amcAdditionalInfo,
        currentStep: 5,
      });
      // If Online, need to check QR code selection first
      if (paymentMode === 'ONLINE') {
        if (!selectedQrCodeId) {
          toast.error('Please select a QR code');
          return;
        }
        // Save QR code selection
        let selectedQrCodeUrl: string | undefined;
        let selectedQrCodeName: string | undefined;
        if (selectedQrCodeId.startsWith('common_')) {
          const qrId = selectedQrCodeId.replace('common_', '');
          const selectedQr = commonQrCodes.find(qr => qr.id === qrId);
          if (selectedQr) {
            selectedQrCodeUrl = selectedQr.qrCodeUrl;
            selectedQrCodeName = selectedQr.name;
          }
        } else if (selectedQrCodeId.startsWith('technician_')) {
          const techId = selectedQrCodeId.replace('technician_', '');
          const selectedTech = technicians.find(t => t.id === techId);
          if (selectedTech && selectedTech.qrCode) {
            selectedQrCodeUrl = selectedTech.qrCode;
            selectedQrCodeName = selectedTech.fullName || 'Technician';
          }
        }
        saveJobCompletionProgress(selectedJobForComplete.id, {
          billPhotos,
          billAmount,
          paymentMode: 'ONLINE',
          qrCodeType,
          selectedQrCodeId,
          selectedQrCodeUrl,
          selectedQrCodeName,
          amcDateGiven,
          amcEndDate,
          amcYears,
          amcIncludesPrefilter,
          amcAdditionalInfo,
          currentStep: 5,
        });
      }
      // Move to step 5 (Payment Screenshot)
      setCompleteJobStep(5);
        return;
    }

    // Step 5: Payment Screenshot (optional) - move to step 7 (OTP) if required, or step 6 (Prefilter)
    if (completeJobStep === 5) {
      // Check if OTP is required
      const needsOtp = requiresOtp();
      
      // Save progress
      saveJobCompletionProgress(selectedJobForComplete.id, {
        billPhotos,
        billAmount,
        paymentMode: paymentMode as 'CASH' | 'ONLINE' | '',
        paymentScreenshot,
        qrCodeType,
        selectedQrCodeId,
        amcDateGiven,
        amcEndDate,
        amcYears,
        amcIncludesPrefilter,
        amcAdditionalInfo,
        currentStep: needsOtp ? 7 : 6,
      });
      
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
    if (completeJobStep === 7) {
      // Validate OTP - check all 4 boxes are filled
      const otpValue = otpInput.join('');
      if (otpValue.length !== 4) {
        setOtpError('Please enter all 4 digits');
        return;
      }
      
      // OTP entered (any 4 digits), proceed to prefilter step (step 6) or submit if softener
      setOtpError('');
      
      // Save progress
      saveJobCompletionProgress(selectedJobForComplete.id, {
        billPhotos,
        billAmount,
        paymentMode: paymentMode as 'CASH' | 'ONLINE' | '',
        paymentScreenshot,
        qrCodeType,
        selectedQrCodeId,
        amcDateGiven,
        amcEndDate,
        amcYears,
        amcIncludesPrefilter,
        amcAdditionalInfo,
        customerHasPrefilter: isSoftenerService() ? null : customerHasPrefilter,
        currentStep: 6,
      });
      
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
    if (completeJobStep === 6) {
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
      const finalSelectedQrCodeId = isBillAmountZero() ? '' : selectedQrCodeId;
      
      // Save progress before submitting
      saveJobCompletionProgress(selectedJobForComplete.id, {
        billPhotos,
        billAmount,
        paymentMode: finalPaymentMode,
        paymentScreenshot: finalPaymentScreenshot,
        qrCodeType: finalQrCodeType,
        selectedQrCodeId: finalSelectedQrCodeId,
        amcDateGiven,
        amcEndDate,
        amcYears,
        amcIncludesPrefilter,
        amcAdditionalInfo,
        customerHasPrefilter: isSoftenerService() ? null : customerHasPrefilter,
        currentStep: 6,
      });
      // Proceed to submit - button is already disabled while uploads are in progress
    }
    
    setIsSubmittingJobCompletion(true);
    
    try {
      // STEP 1: Ensure all photos are uploaded to Cloudinary (must be URLs, not local files)
      console.log('📸 All bill photos before filtering:', billPhotos);
      const uploadedBillPhotos = billPhotos.filter(url => 
        url && typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'))
      );
      console.log('📸 Uploaded bill photos (http/https URLs):', uploadedBillPhotos);
      console.log('📸 Uploaded bill photos count:', uploadedBillPhotos.length);
      
      // Check if there are any non-uploaded photos
      const nonUploadedPhotos = billPhotos.filter(url => 
        url && typeof url === 'string' && !url.startsWith('http://') && !url.startsWith('https://')
      );
      
      if (nonUploadedPhotos.length > 0) {
        console.warn('⚠️ Non-uploaded photos detected:', nonUploadedPhotos);
        toast.error(`Please wait for ${nonUploadedPhotos.length} photo(s) to finish uploading before completing the job.`);
        setIsSubmittingJobCompletion(false);
        return;
      }
      
      // Check payment screenshot if ONLINE payment
      console.log('📸 Payment screenshot check:', {
        paymentScreenshot,
        paymentMode,
        isString: typeof paymentScreenshot === 'string',
        length: paymentScreenshot?.length || 0,
        startsWithHttp: paymentScreenshot?.startsWith('http://') || paymentScreenshot?.startsWith('https://'),
        includesCloudinary: paymentScreenshot?.includes('cloudinary.com')
      });
      
      if (paymentMode === 'ONLINE' && paymentScreenshot) {
        // Check if payment screenshot is a valid uploaded URL (http/https or Cloudinary URL)
        const isValidUrl = paymentScreenshot && typeof paymentScreenshot === 'string' && (
          paymentScreenshot.startsWith('http://') || 
          paymentScreenshot.startsWith('https://') ||
          paymentScreenshot.includes('cloudinary.com')
        );
        
        if (!isValidUrl) {
          console.warn('⚠️ Payment screenshot not uploaded yet or invalid format:', paymentScreenshot);
          toast.error('Please wait for payment screenshot to finish uploading before completing the job.');
          setIsSubmittingJobCompletion(false);
          return;
        } else {
          console.log('✅ Payment screenshot is uploaded and valid:', paymentScreenshot);
        }
      } else if (paymentMode === 'ONLINE' && !paymentScreenshot) {
        console.log('ℹ️ Payment mode is ONLINE but no payment screenshot provided (optional)');
      }

      // STEP 2: Get QR code details
      // Note: QR codes are NOT uploaded to Cloudinary - we use the existing URL directly
      // QR codes are already stored in the database (common_qr_codes table) or technician profiles
      // If the QR code URL is already a Cloudinary URL, we use it as-is without uploading
      let selectedQrCodeUrl: string | undefined;
      let selectedQrCodeName: string | undefined;
      
      if (selectedQrCodeId && selectedQrCodeId.startsWith('common_')) {
        const qrId = selectedQrCodeId.replace('common_', '');
        const selectedQr = commonQrCodes.find(qr => qr.id === qrId);
        if (selectedQr) {
          selectedQrCodeUrl = selectedQr.qrCodeUrl;
          selectedQrCodeName = selectedQr.name;
          // Check if QR code URL is already a Cloudinary URL - if so, use it directly (no upload needed)
          if (selectedQrCodeUrl && (
            selectedQrCodeUrl.includes('cloudinary.com') || 
            selectedQrCodeUrl.includes('res.cloudinary.com') ||
            selectedQrCodeUrl.startsWith('http://') || 
            selectedQrCodeUrl.startsWith('https://')
          )) {
            console.log('✅ QR code URL is already a valid URL (Cloudinary or other), using directly:', selectedQrCodeUrl);
          }
        }
      } else if (selectedQrCodeId && selectedQrCodeId.startsWith('technician_')) {
        const techId = selectedQrCodeId.replace('technician_', '');
        const selectedTech = technicians.find(t => t.id === techId);
        if (selectedTech && selectedTech.qrCode) {
          selectedQrCodeUrl = selectedTech.qrCode;
          selectedQrCodeName = selectedTech.fullName || 'Technician';
          // Check if QR code URL is already a Cloudinary URL - if so, use it directly (no upload needed)
          if (selectedQrCodeUrl && (
            selectedQrCodeUrl.includes('cloudinary.com') || 
            selectedQrCodeUrl.includes('res.cloudinary.com') ||
            selectedQrCodeUrl.startsWith('http://') || 
            selectedQrCodeUrl.startsWith('https://')
          )) {
            console.log('✅ Technician QR code URL is already a valid URL (Cloudinary or other), using directly:', selectedQrCodeUrl);
          }
        }
      }

      // STEP 3: Submit directly to database
      try {
        // Prepare update data
        let dbPaymentMethod: 'CASH' | 'CARD' | 'UPI' | 'BANK_TRANSFER' | 'PARTIAL' | null = null;
        let paymentAmount = parseFloat(billAmount) || 0;
        if (!isBillAmountZero()) {
          if (paymentMode === 'CASH') {
            dbPaymentMethod = 'CASH';
          } else if (paymentMode === 'ONLINE') {
            dbPaymentMethod = 'UPI';
          } else if (paymentMode === 'PARTIAL') {
            dbPaymentMethod = 'PARTIAL';
            const cash = parseFloat(partialCashAmount) || 0;
            const online = parseFloat(partialOnlineAmount) || 0;
            paymentAmount = cash + online;
          }
        }
        
        const updateData: any = {
          status: 'COMPLETED',
          end_time: new Date().toISOString(),
          completion_notes: completionNotes.trim(),
          completed_by: user?.id || user?.technicianId || null,
          completed_at: new Date().toISOString(),
          actual_cost: parseFloat(billAmount) || 0,
          payment_amount: paymentAmount,
          payment_method: dbPaymentMethod || (isBillAmountZero() ? null : 'CASH'),
        };

        // Fetch latest job data to ensure we have the most up-to-date requirements
        const { data: latestJobData, error: fetchError } = await db.jobs.getById(selectedJobForComplete.id);
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
        }

        // Remove existing photo-related requirements to avoid duplicates
        requirements = requirements.filter((req: any) => !req.bill_photos && !req.payment_photos && !req.qr_photos);

        // Add bill photos (all should be uploaded Cloudinary URLs at this point)
        if (uploadedBillPhotos.length > 0) {
          requirements.push({ bill_photos: uploadedBillPhotos });
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
        
        // Add qr_photos to requirements for ONLINE and PARTIAL (online part) payments
        if (paymentMode === 'ONLINE' || (paymentMode === 'PARTIAL' && selectedQrCodeId)) {
          if (selectedQrCodeUrl && !(
            selectedQrCodeUrl.includes('cloudinary.com') || 
            selectedQrCodeUrl.includes('res.cloudinary.com') ||
            selectedQrCodeUrl.startsWith('http://') || 
            selectedQrCodeUrl.startsWith('https://')
          )) {
            console.warn('⚠️ QR code URL is not a valid URL format:', selectedQrCodeUrl);
          }
          const qrPhotos: any = {
            qr_code_type: qrCodeType,
            selected_qr_code_id: selectedQrCodeId,
            payment_screenshot: isPaymentScreenshotUploaded ? paymentScreenshot : null,
            selected_qr_code_url: selectedQrCodeUrl,
            selected_qr_code_name: selectedQrCodeName,
          };
          requirements.push({ qr_photos: qrPhotos });
          console.log('✅ Added qr_photos to requirements:', qrPhotos);
        }
        if (paymentMode === 'PARTIAL') {
          const cash = parseFloat(partialCashAmount) || 0;
          const online = parseFloat(partialOnlineAmount) || 0;
          requirements.push({ partial_cash_amount: cash, partial_online_amount: online });
        }
        if ((paymentMode !== 'ONLINE' && paymentMode !== 'PARTIAL') && isPaymentScreenshotUploaded) {
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

        // Add AMC info for reference (technician provides this, admin will create official AMC)
        // Only add if years > 0 (0 years means no AMC)
        const effectiveHasAMC = hasAMC === true && amcYears > 0;
        if (effectiveHasAMC) {
          const amcInfo = {
            date_given: amcDateGiven || null,
            end_date: amcEndDate || null,
            years: amcYears,
            amount: amcAmount ? parseFloat(amcAmount) : null,
            includes_prefilter: amcIncludesPrefilter || false,
            additional_info: amcAdditionalInfo || null,
            notes: amcAdditionalInfo || null,
            technician_reference: true // Mark as technician reference, not official AMC
          };
          requirements.push({ amc_info: amcInfo });
          console.log('✅ Added AMC info (reference) to requirements:', amcInfo);
        }

        // Always update requirements (even if empty) to ensure job is marked as completed
        // Job completion should succeed even if photos aren't uploaded yet
        updateData.requirements = JSON.stringify(requirements);

        // Wrap database update with timeout (30 seconds)
        const updatePromise = db.jobs.update(selectedJobForComplete.id, updateData);
        const { error } = await withTimeout(
          updatePromise,
          30000, // 30 second timeout
          'Job completion submission is taking longer than expected'
        );

        if (error) {
          throw new Error(error.message);
        }
        
        // Verify requirements were saved correctly
        const { data: verifyJobData } = await db.jobs.getById(selectedJobForComplete.id);
        if (verifyJobData) {
          const savedRequirements = typeof verifyJobData.requirements === 'string' 
            ? JSON.parse(verifyJobData.requirements) 
            : verifyJobData.requirements;
          const savedBillPhotos = savedRequirements?.find((req: any) => req.bill_photos)?.bill_photos || [];
          console.log(`✅ Job completed! Saved ${savedBillPhotos.length} bill photos to requirements:`, savedBillPhotos);
        }
        
        
        // Job completed successfully!
        // Count all photos: bill photos + payment screenshot
        const totalPhotosCount = uploadedBillPhotos.length + (paymentScreenshot && paymentScreenshot.startsWith('http') ? 1 : 0);
        if (totalPhotosCount > 0) {
          toast.success(`Job completed successfully with ${totalPhotosCount} photo(s)!`, {
            duration: 3000,
          });
        } else {
          toast.success('Job completed successfully!', {
            duration: 3000,
          });
        }

        // Update customer prefilter status and raw_water_tds if provided (RO jobs only)
        if (customerHasPrefilter !== null || (rawWaterTds !== '' && !isSoftenerService())) {
          // Get customer UUID from job - prioritize customer.id (UUID) over customer_id
          // customer.id is the UUID primary key, customer_id in job is also UUID foreign key
          const customerId = 
            (selectedJobForComplete.customer as any)?.id ||  // UUID from joined customer object (most reliable)
            selectedJobForComplete.customer?.id ||           // UUID from customer object
            selectedJobForComplete.customer_id ||            // UUID foreign key in job table
            (selectedJobForComplete as any).customer_id ||   // Alternative field name
            selectedJobForComplete.customerId;              // Fallback
          
          if (customerId) {
            try {
              const updatePayload: Record<string, any> = {};
              if (customerHasPrefilter !== null) updatePayload.has_prefilter = customerHasPrefilter;
              const tdsVal = parseInt(rawWaterTds, 10);
              if (!isSoftenerService() && !isNaN(tdsVal) && tdsVal >= 0) {
                updatePayload.raw_water_tds = tdsVal;
              } else if (!isSoftenerService() && rawWaterTds === '') {
                updatePayload.raw_water_tds = 0;
              }
              if (Object.keys(updatePayload).length > 0) {
                console.log('🔄 Updating customer prefilter/raw_water_tds:', {
                  customerId,
                  hasPrefilter: customerHasPrefilter,
                  raw_water_tds: updatePayload.raw_water_tds,
                  jobId: selectedJobForComplete.id,
                });
                
                const { data, error } = await db.customers.update(customerId, updatePayload);
                
                if (error) {
                  console.error('❌ Failed to update customer prefilter status:', {
                    error,
                    customerId,
                    hasPrefilter: customerHasPrefilter,
                    errorMessage: error.message,
                    errorCode: error.code
                  });
                  toast.error(`Failed to update customer prefilter status: ${error.message || 'Unknown error'}`);
                } else {
                  console.log('✅ Customer prefilter status updated successfully:', {
                    customerId,
                    hasPrefilter: customerHasPrefilter,
                    updatedData: data
                  });
                }
              }
            } catch (error: any) {
              console.error('❌ Error updating customer prefilter status:', {
                error,
                customerId,
                hasPrefilter: customerHasPrefilter,
                errorMessage: error?.message,
                errorStack: error?.stack
              });
              toast.error(`Failed to update customer prefilter status: ${error?.message || 'Unknown error'}`);
            }
          } else {
            console.warn('⚠️ Cannot update customer prefilter: customer UUID not found in job', {
              jobId: selectedJobForComplete.id,
              jobNumber: (selectedJobForComplete as any).job_number || selectedJobForComplete.jobNumber,
              customer: selectedJobForComplete.customer ? {
                id: (selectedJobForComplete.customer as any)?.id,
                customer_id: (selectedJobForComplete.customer as any)?.customer_id,
                fullName: selectedJobForComplete.customer.fullName || (selectedJobForComplete.customer as any)?.full_name
              } : 'missing',
              customer_id: selectedJobForComplete.customer_id,
              customerId: selectedJobForComplete.customerId
            });
            toast.warning('Could not update customer prefilter: customer ID not found');
          }
        }

        // Update local state - preserve order (don't re-sort)
        shouldPreserveOrderRef.current = true;
        setJobs(prev => prev.map(job => 
          job.id === selectedJobForComplete.id ? { 
                ...job, 
                status: 'COMPLETED',
                end_time: new Date().toISOString(),
            completionNotes: completionNotes.trim(),
                completedBy: user?.id || user?.technicianId || null,
            completedAt: new Date().toISOString(),
            actual_cost: parseFloat(billAmount) || 0,
            payment_amount: parseFloat(billAmount) || 0,
          } : job
        ));
        
        setIsSubmittingJobCompletion(false);
        // Job completed - dialog will close automatically
        setCompleteDialogOpen(false);
        
        // Reset form state
        setSelectedJobForComplete(null);
        setCompletionNotes('');
        setCompleteJobStep(1);
        setBillAmount('');
        setBillPhotos([]);
        setAmcDateGiven(new Date().toISOString().split('T')[0]);
        setAmcEndDate('');
        setAmcYears(0);
        setAmcIncludesPrefilter(false);
        setHasAMC(null);
        setPaymentMode('');
        setPartialCashAmount('');
        setPartialOnlineAmount('');
        setCustomerHasPrefilter(null);
        setRawWaterTds('');
        setQrCodeType('');
        setSelectedQrCodeId('');
        setPaymentScreenshot('');

      } catch (submitError: any) {
        setIsSubmittingJobCompletion(false);
        console.error('Job completion submission failed:', submitError);
        toast.error(`Failed to complete job: ${submitError?.message || 'Unknown error'}`);
      }
    } catch (error: any) {
      setIsSubmittingJobCompletion(false);
      console.error('Error preparing job completion:', error);
      toast.error('Failed to save job completion. Please try again.');
    }
  };


  // Helper function to handle phone click
  const handlePhoneClick = (customer: any) => {
    const phone = customer?.phone;
    const alternatePhone = customer?.alternate_phone || customer?.alternatePhone;
    const fullName = customer?.full_name || customer?.fullName;
    
    if (alternatePhone) {
      setSelectedCustomerPhone({ phone, alternate_phone: alternatePhone, full_name: fullName });
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
    let cleaned = phone.replace(/\D/g, '');
    
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

  // Helper function to get all photos for a job
  const getAllJobPhotos = (job: Job): string[] => {
    const photos: string[] = [];
    
    // Get photos from job
    if (job.beforePhotos && Array.isArray(job.beforePhotos)) photos.push(...job.beforePhotos);
    if (job.before_photos && Array.isArray(job.before_photos)) photos.push(...job.before_photos);
    if (job.afterPhotos && Array.isArray(job.afterPhotos)) photos.push(...job.afterPhotos);
    if (job.after_photos && Array.isArray(job.after_photos)) photos.push(...job.after_photos);
    if (job.images && Array.isArray(job.images)) photos.push(...job.images);
    
    // Remove duplicates and filter out empty values
    const uniquePhotos = Array.from(new Set(photos.filter(photo => photo && photo.trim() !== '')));
    return uniquePhotos;
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

  // Helper function to get all photos for a customer from all their jobs
  const getAllCustomerPhotos = async (customerId: string): Promise<string[]> => {
    try {
      setLoadingCustomerPhotos(true);
      
      // First, check if customerId is customer_id (string) or UUID
      // If it's customer_id, we need to get the customer's UUID first
      let customerUuid = customerId;
      
      // Check if it looks like a customer_id (starts with 'C' and has numbers) or is a UUID
      if (customerId && customerId.startsWith('C') && customerId.length < 36) {
        // It's a customer_id, need to get UUID
        const { data: customer, error: customerError } = await db.customers.getByCustomerId(customerId);
        if (customerError || !customer) {
          console.error('Error fetching customer:', customerError);
          return [];
        }
        customerUuid = customer.id;
      }
      
      const { data: customerJobs, error } = await db.jobs.getByCustomerId(customerUuid);
      
      if (error) {
        console.error('Error fetching customer jobs:', error);
        return [];
      }
      
      // Use Map to track photo URLs with their job dates for sorting (latest first)
      const photoMap = new Map<string, number>(); // URL -> timestamp
      
      // Sort jobs by completion/creation date (latest first) to prioritize newer photos
      const sortedJobs = [...(customerJobs || [])].sort((a, b) => {
        const dateA = (a as any).completed_at || a.completedAt || a.created_at || a.createdAt || '';
        const dateB = (b as any).completed_at || b.completedAt || b.created_at || b.createdAt || '';
        if (!dateA && !dateB) return 0;
        if (!dateA) return 1;
        if (!dateB) return -1;
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      });
      
      if (sortedJobs && Array.isArray(sortedJobs)) {
        sortedJobs.forEach((job: any) => {
          // Get job timestamp for sorting (prefer completed_at, fallback to created_at)
          const jobTimestamp = (job as any).completed_at || job.completedAt 
            ? new Date((job as any).completed_at || job.completedAt).getTime()
            : (job.created_at || job.createdAt 
              ? new Date(job.created_at || job.createdAt).getTime()
              : Date.now());
          
          // Get photos from before_photos field
          const jobBeforePhotos = Array.isArray(job.before_photos || job.beforePhotos) 
            ? (job.before_photos || job.beforePhotos) 
            : [];
          const extractedBeforePhotos = extractPhotoUrls(jobBeforePhotos);
          extractedBeforePhotos.forEach(url => {
            // Only add if not already present, or if this job is newer (higher timestamp)
            if (!photoMap.has(url) || photoMap.get(url)! < jobTimestamp) {
              photoMap.set(url, jobTimestamp);
            }
          });
          
          // Get photos from after_photos field
          const jobAfterPhotos = Array.isArray(job.after_photos || job.afterPhotos) 
            ? (job.after_photos || job.afterPhotos) 
            : [];
          const extractedAfterPhotos = extractPhotoUrls(jobAfterPhotos);
          extractedAfterPhotos.forEach(url => {
            // Only add if not already present, or if this job is newer (higher timestamp)
            if (!photoMap.has(url) || photoMap.get(url)! < jobTimestamp) {
              photoMap.set(url, jobTimestamp);
            }
          });
          
          // Also check if there are photos in the images field
          const jobImages = Array.isArray(job.images) ? job.images : [];
          const extractedImages = extractPhotoUrls(jobImages);
          extractedImages.forEach(url => {
            // Only add if not already present, or if this job is newer (higher timestamp)
            if (!photoMap.has(url) || photoMap.get(url)! < jobTimestamp) {
              photoMap.set(url, jobTimestamp);
            }
          });
          
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
                      photoUrls.forEach(url => {
                        if (!photoMap.has(url) || photoMap.get(url)! < jobTimestamp) {
                          photoMap.set(url, jobTimestamp);
                        }
                      });
                    });
                  }
                  if (req.payment_photos && Array.isArray(req.payment_photos)) {
                    req.payment_photos.forEach((photo: any) => {
                      const photoUrls = extractPhotoUrls([photo]);
                      photoUrls.forEach(url => {
                        if (!photoMap.has(url) || photoMap.get(url)! < jobTimestamp) {
                          photoMap.set(url, jobTimestamp);
                        }
                      });
                    });
                  }
                  // Also check qr_photos for payment screenshots (from secondary account)
                  // NOTE: We do NOT add QR code URLs (selected_qr_code_url) to customer photos
                  // QR codes are already stored in Cloudinary and are just references, not actual job photos
                  if (req.qr_photos && typeof req.qr_photos === 'object') {
                    if (req.qr_photos.payment_screenshot) {
                      const screenshotUrls = extractPhotoUrls([req.qr_photos.payment_screenshot]);
                      screenshotUrls.forEach(url => {
                        if (!photoMap.has(url) || photoMap.get(url)! < jobTimestamp) {
                          photoMap.set(url, jobTimestamp);
                        }
                      });
                    }
                    // Do NOT add selected_qr_code_url to photos - QR codes are reference URLs, not job photos
                    // QR codes are stored separately in qr_photos requirements and shouldn't appear in customer photo gallery
                  }
                });
              } else if (typeof requirements === 'object' && requirements !== null) {
                if (requirements.bill_photos && Array.isArray(requirements.bill_photos)) {
                  requirements.bill_photos.forEach((photo: any) => {
                    const photoUrls = extractPhotoUrls([photo]);
                    photoUrls.forEach(url => {
                      if (!photoMap.has(url) || photoMap.get(url)! < jobTimestamp) {
                        photoMap.set(url, jobTimestamp);
                      }
                    });
                  });
                }
                if (requirements.payment_photos && Array.isArray(requirements.payment_photos)) {
                  requirements.payment_photos.forEach((photo: any) => {
                    const photoUrls = extractPhotoUrls([photo]);
                    photoUrls.forEach(url => {
                      if (!photoMap.has(url) || photoMap.get(url)! < jobTimestamp) {
                        photoMap.set(url, jobTimestamp);
                      }
                    });
                  });
                }
                // Also check qr_photos for payment screenshots (from secondary account)
                // NOTE: We do NOT add QR code URLs (selected_qr_code_url) to customer photos
                // QR codes are already stored in Cloudinary and are just references, not actual job photos
                if (requirements.qr_photos && typeof requirements.qr_photos === 'object') {
                  if (requirements.qr_photos.payment_screenshot) {
                    const screenshotUrls = extractPhotoUrls([requirements.qr_photos.payment_screenshot]);
                    screenshotUrls.forEach(url => {
                      if (!photoMap.has(url) || photoMap.get(url)! < jobTimestamp) {
                        photoMap.set(url, jobTimestamp);
                      }
                    });
                  }
                  // Do NOT add selected_qr_code_url to photos - QR codes are reference URLs, not job photos
                  // QR codes are stored separately in qr_photos requirements and shouldn't appear in customer photo gallery
                }
              }
            } catch (e) {
              // Ignore parse errors
              console.error('Error parsing requirements:', e);
            }
          }
        });
      }
      
      // Convert Map to Array and sort by timestamp (latest first)
      const uniquePhotos = Array.from(photoMap.entries())
        .sort((a, b) => b[1] - a[1]) // Sort by timestamp descending (latest first)
        .map(([url]) => url); // Extract just the URLs
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
    if (customTime) {
      // Format custom time (HH:MM) to readable format (e.g., "2:44 AM")
      const [hours, minutes] = customTime.split(':');
      const hour24 = parseInt(hours);
      const minute24 = parseInt(minutes || '0');
      
      // Round to nearest 10 minutes
      const rounded = roundToNearest10(hour24, minute24);
      const roundedHour24 = rounded.hours;
      const roundedMinute = rounded.minutes;
      
      const hour12 = roundedHour24 > 12 ? roundedHour24 - 12 : (roundedHour24 === 0 ? 12 : roundedHour24);
      const ampm = roundedHour24 >= 12 ? 'PM' : 'AM';
      const formattedMinutes = String(roundedMinute).padStart(2, '0');
      
      return `${dateStr} ${hour12}:${formattedMinutes} ${ampm}`;
    } else if (scheduledTimeSlot) {
      // For time slots, show date and time slot
      const timeSlotMap: {[key: string]: string} = {
        'MORNING': 'Morning (9 AM - 12 PM)',
        'AFTERNOON': 'Afternoon (12 PM - 5 PM)',
        'EVENING': 'Evening (5 PM - 8 PM)',
        'CUSTOM': customTime || 'Custom Time'
      };
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
    const status = (job as any).status || job.status;
    
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <ThreeDotLoader size="lg" />
          <p className="text-gray-600 mt-4">Loading...</p>
        </div>
      </div>
    );
  }

  const ongoingCount = jobs.filter(job => {
    const status = (job as any).status || job.status;
    return !['FOLLOW_UP', 'DENIED', 'COMPLETED'].includes(status);
  }).length; // Jobs excluding follow-up, denied, and completed
  const followUpCount = jobs.filter(job => job.status === 'FOLLOW_UP').length;
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
              <Logo />
            </div>
          </div>
          
          {/* Settings Button on Right */}
          <div className="flex items-center ml-auto z-50">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                >
                  <Settings className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem 
                  onClick={() => {
                    setTechnicianIdCardDialogOpen(true);
                  }}
                >
                  <QrCode className="w-4 h-4 mr-2" />
                  Show ID Card QR
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => {
                    setInventoryDialogOpen(true);
                  }}
                >
                  <Package className="w-4 h-4 mr-2" />
                  My Inventory
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => setCommonQrDialogOpen(true)}
                >
                  <QrCode className="w-4 h-4 mr-2" />
                  Common QR
                </DropdownMenuItem>
                <DropdownMenuItem onClick={logout}>
                  <LogOut className="w-4 h-4 mr-2" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
      </div>

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
                  
                  return (
                    <Card key={request.id} className="border-orange-200">
                      <CardContent className="p-4">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <div className={`w-4 h-4 ${customerAMCStatus[customer?.id] ? 'bg-green-500' : 'bg-gray-400'} rounded-sm flex items-center justify-center relative`}>
                                <div className="w-2 h-2 bg-white rounded-sm"></div>
                                {customerAMCStatus[customer?.id] && (
                                  <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-green-600 rounded-full border border-white" title="Active AMC"></div>
                                )}
                              </div>
                              <span className="font-bold text-lg text-gray-900">
                                {customer?.full_name || 'N/A'}
                              </span>
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
                                              // Open Google Maps exactly like in admin dashboard
                                              const customerLocation = customer?.location;
                                              const googleLoc = customerLocation?.googleLocation;
                                              
                                              if (googleLoc && typeof googleLoc === 'string' && 
                                                  (googleLoc.includes('google.com/maps') || googleLoc.includes('maps.app.goo.gl') || googleLoc.includes('goo.gl/maps')) &&
                                                  !googleLoc.includes('localhost') && 
                                                  !googleLoc.includes('127.0.0.1')) {
                                                window.open(googleLoc, '_blank', 'noopener,noreferrer');
                                              } else {
                                                const location = extractCoordinates(customerLocation);
                                                if (location && location.latitude !== 0 && location.longitude !== 0) {
                                                  window.open(`https://www.google.com/maps/place/${location.latitude},${location.longitude}`, '_blank', 'noopener,noreferrer');
                                                } else {
                                                  toast.error('Location data not available');
                                                }
                                              }
                                            }}
                                            className="cursor-pointer"
                                          >
                                            <MapPin className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
                                          </button>
                              </div>
                                        <div className="flex-1 min-w-0">
                                          <div className="text-sm font-semibold text-gray-900">Location</div>
                                          <div className="text-xs text-gray-500">
                                            {(() => {
                                              // Exactly like admin dashboard - check both customer.visible_address and customer.address.visible_address
                                              const customerData = customer as any;
                                              const visibleAddress = customerData?.visible_address || (customerData?.address as any)?.visible_address || (address as any)?.visible_address;
                                              
                                              if (visibleAddress && String(visibleAddress).trim()) {
                                                return (
                                                  <button
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      setSelectedJobForAddress(job as any);
                                                      setAddressDialogOpen(prev => ({ ...prev, [(job as any).id]: true }));
                                                    }}
                                                    className="text-left text-black hover:text-gray-700 hover:underline transition-colors cursor-pointer font-medium w-full text-left"
                                                    title="Click to view full address"
                                                  >
                                                    {String(visibleAddress).trim()}
                                                  </button>
                                                );
                                              }
                                              
                                              // If no visible_address, check if there's any address
                                              return (customerData?.address || address) ? (
                                                <button
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedJobForAddress(job as any);
                                                    setAddressDialogOpen(prev => ({ ...prev, [(job as any).id]: true }));
                                                  }}
                                                  className="text-left text-gray-500 hover:text-gray-700 hover:underline transition-colors cursor-pointer"
                                                  title="Click to view full address"
                                                >
                                                  View Address
                                                </button>
                                              ) : 'No location';
                                            })()}
                            </div>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })()}

                                {/* Photos */}
                                {(() => {
                                  const customerId = (customer as any)?.id || customer?.id;
                                  return (
                                    <div className="bg-white rounded-lg p-3 border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all duration-200">
                                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                                        <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                          <button
                                            onClick={async () => {
                                              if (customerId) {
                                                setLoadingCustomerPhotos(true);
                                                const allCustomerPhotos = await getAllCustomerPhotos(customerId);
                                                setSelectedJobPhotos({ 
                                                  jobId: job.id, 
                                                  photos: allCustomerPhotos,
                                                  customerId 
                                                });
                                                setPhotosDialogOpen(true);
                                                setLoadingCustomerPhotos(false);
                                              } else {
                                                // Fallback to job photos only - only load when button is clicked
                                                const jobPhotos = getAllJobPhotos(job);
                                                setSelectedJobPhotos({ jobId: job.id, photos: jobPhotos });
                                                setPhotosDialogOpen(true);
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
                                              : customerId
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
                                            handleWhatsAppClick(customer.phone || '');
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
            {filteredJobs.map((job) => {
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
                      (job as any).status === 'IN_PROGRESS' || job.status === 'IN_PROGRESS'
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
                      <div className="mb-4 -mt-2 -mx-2">
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
                    <div className="mb-4 -mt-2 -mx-2">
                      <div className="rounded-md border border-purple-200 bg-purple-50 px-4 py-3">
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
                        {/* Action buttons for follow-up */}
                        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-purple-200">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              markJobAsSeen(job.id);
                              handleScheduleFollowUp(job);
                            }}
                            disabled={isUpdating}
                            className="flex-1 min-w-[120px] border-purple-300 text-purple-700 hover:bg-purple-100"
                          >
                            <CalendarPlus className="w-4 h-4 mr-2" />
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
                            className="flex-1 min-w-[120px] border-blue-300 text-blue-700 hover:bg-blue-100"
                          >
                            <ArrowRight className="w-4 h-4 mr-2" />
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
                          <div className={`w-4 h-4 ${customerAMCStatus[(job.customer as any)?.id] ? 'bg-green-500' : 'bg-gray-400'} rounded-sm flex items-center justify-center relative`}>
                            <div className="w-2 h-2 bg-white rounded-sm"></div>
                            {customerAMCStatus[(job.customer as any)?.id] && (
                              <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-green-600 rounded-full border border-white" title="Active AMC"></div>
                            )}
                          </div>
                          <span className="font-bold text-lg text-gray-900">
                            {(job.customer as any)?.full_name || 'N/A'}
                          </span>
                        {getStatusBadge((job as any).status || job.status)}
                        {((job as any).status === 'ASSIGNED' || job.status === 'ASSIGNED') && !seenJobs.has(job.id) && (
                          <Badge className="bg-blue-100 text-blue-800 border-blue-300 animate-pulse shadow-lg shadow-blue-400/50 ring-2 ring-blue-400 ring-opacity-75">
                            NEW
                          </Badge>
                        )}
                          {distances[job.id] && (
                            <div className="text-sm text-blue-600 font-medium">
                              📍 {distances[job.id]} km
                            </div>
                          )}
                        </div>
                      {/* Service type with Brand/Model */}
                      <div className="mb-3 space-y-1">
                        <div className="text-sm">
                          <span className="font-medium text-gray-700 inline-block w-28">Service Type:</span>
                          <span className="text-gray-600">{(job as any).service_type || job.serviceType} - {(job as any).service_sub_type || job.serviceSubType}</span>
                        </div>
                        {(() => {
                          const customer = job.customer as any;
                          const jobData = job as any;
                          
                          // Helper function to check if value is valid (not empty, not "Not specified")
                          const isValidValue = (val: string) => {
                            return val && 
                              val !== 'Not specified' && 
                              val.toLowerCase() !== 'not specified' && 
                              val.trim() !== '';
                          };
                          
                          // Get job brand/model
                          const jobBrand = jobData.brand || job.brand || '';
                          const jobModel = jobData.model || job.model || '';
                          
                          // Check if job has valid brand/model (treat "Not specified" as empty)
                          const hasValidJobBrand = isValidValue(jobBrand);
                          const hasValidJobModel = isValidValue(jobModel);
                          
                          let brand = hasValidJobBrand ? jobBrand : '';
                          let model = hasValidJobModel ? jobModel : '';
                          
                          // If job doesn't have valid brand/model, try to get from customer
                          if (!brand || !model) {
                            const customerBrand = customer?.brand || '';
                            const customerModel = customer?.model || '';
                            const jobServiceType = (jobData.service_type || job.serviceType || '').toUpperCase();
                            
                            // If customer has comma-separated values, parse them based on service type
                            if (customerBrand && customerBrand.includes(',')) {
                              const brands = customerBrand.split(',').map((b: string) => b.trim());
                              const models = customerModel ? customerModel.split(',').map((m: string) => m.trim()) : [];
                              
                              // Try to match service type to get the right brand/model
                              // For RO jobs, use first brand/model; for SOFTENER, use second if available
                              if (jobServiceType === 'RO' || jobServiceType === '') {
                                if (!brand) brand = brands[0] || '';
                                if (!model) model = models[0] || '';
                              } else if (jobServiceType === 'SOFTENER' && brands.length > 1) {
                                if (!brand) brand = brands[1] || brands[0] || '';
                                if (!model) model = models[1] || models[0] || '';
                              } else {
                                // Fallback: use first available
                                if (!brand) brand = brands[0] || '';
                                if (!model) model = models[0] || '';
                              }
                            } else {
                              // Customer has single brand/model values - only use if valid
                              if (!brand && isValidValue(customerBrand)) brand = customerBrand;
                              if (!model && isValidValue(customerModel)) model = customerModel;
                            }
                          }
                          
                          // Filter out "Not specified" values - only show if we have actual values
                          const validBrand = isValidValue(brand) ? brand.trim() : '';
                          const validModel = isValidValue(model) ? model.trim() : '';
                          
                          // Debug logging (removed to prevent duplicate logs in React Strict Mode)
                          // Equipment data is processed correctly, logging was causing duplicate console entries
                          
                          // Show equipment if we have a valid brand or model (only once)
                          if (validBrand || validModel) {
                            const displayText = validBrand && validModel 
                              ? `${validBrand} - ${validModel}` 
                              : validBrand || validModel;
                            
                            return (
                              <div className="text-sm">
                                <span className="font-medium text-gray-700 inline-block w-28">Equipment:</span>
                                <span className="text-gray-600">{displayText}</span>
                              </div>
                            );
                          }
                          
                          // Fallback: If no valid brand/model but we have customer data, show it anyway (only if first check didn't return)
                          if (customer?.brand && customer.brand.trim() !== '') {
                            const displayBrand = customer.brand.includes(',') 
                              ? customer.brand.split(',')[0].trim() 
                              : customer.brand.trim();
                            const displayModel = customer?.model && customer.model.includes(',')
                              ? customer.model.split(',')[0].trim()
                              : customer?.model ? customer.model.trim() : '';
                            
                            // Only show if brand is valid and we didn't already show equipment above
                            if (displayBrand && displayBrand !== 'Not specified' && !validBrand && !validModel) {
                              const displayText = displayModel && displayModel !== 'Not specified'
                                ? `${displayBrand} - ${displayModel}`
                                : displayBrand;
                              
                              return (
                                <div className="text-sm">
                                  <span className="font-medium text-gray-700 inline-block w-28">Equipment:</span>
                                  <span className="text-gray-600">{displayText}</span>
                                </div>
                              );
                            }
                          }
                          
                          return null;
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
                            if (customTime) {
                              const [hours, minutes] = customTime.split(':');
                              const hour24 = parseInt(hours);
                              const minute24 = parseInt(minutes || '0');
                              const hour12 = hour24 > 12 ? hour24 - 12 : (hour24 === 0 ? 12 : hour24);
                              const ampm = hour24 >= 12 ? 'PM' : 'AM';
                              const formattedMinutes = String(minute24).padStart(2, '0');
                              timeDisplay = `${hour12}:${formattedMinutes} ${ampm}`;
                            } else if (scheduledTimeSlot) {
                              const timeSlotMap: { [key: string]: string } = {
                                'MORNING': 'Morning (9 AM - 12 PM)',
                                'AFTERNOON': 'Afternoon (12 PM - 5 PM)',
                                'EVENING': 'Evening (5 PM - 8 PM)',
                                'CUSTOM': 'Custom Time'
                              };
                              timeDisplay = timeSlotMap[scheduledTimeSlot] || scheduledTimeSlot;
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
                        const billPhotosReq = requirements.find((r: any) => r?.bill_photos);
                        const qrReq = requirements.find((r: any) => r?.qr_photos);
                        const billPhotos: string[] = Array.isArray(billPhotosReq?.bill_photos) ? billPhotosReq.bill_photos : [];
                        const paymentScreenshot = qrReq?.qr_photos?.payment_screenshot || null;
                        const hasBill = (billPhotos.length > 0) || !!paymentScreenshot;
                        return (
                          <div className="mb-3 pt-3 border-t border-gray-200 flex flex-wrap gap-2">
                            {hasBill && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  const allPhotos: string[] = [];
                                  allPhotos.push(...billPhotos);
                                  if (paymentScreenshot) allPhotos.push(paymentScreenshot);
                                  if (allPhotos.length > 0) {
                                    setSelectedBillPhotos(allPhotos);
                                    setSelectedPhoto({ url: allPhotos[0], index: 0, total: allPhotos.length });
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
                                    
                                    // Open Google Maps exactly like in admin dashboard
                                    const customerLocation = (job.customer as any)?.location;
                                    const googleLoc = customerLocation?.googleLocation;
                                    
                                    if (googleLoc && typeof googleLoc === 'string' && 
                                        (googleLoc.includes('google.com/maps') || googleLoc.includes('maps.app.goo.gl') || googleLoc.includes('goo.gl/maps')) &&
                                        !googleLoc.includes('localhost') && 
                                        !googleLoc.includes('127.0.0.1')) {
                                      window.open(googleLoc, '_blank', 'noopener,noreferrer');
                                    } else {
                                      const location = extractCoordinates(customerLocation);
                                      if (location && location.latitude !== 0 && location.longitude !== 0) {
                                        window.open(`https://www.google.com/maps/place/${location.latitude},${location.longitude}`, '_blank', 'noopener,noreferrer');
                                      } else {
                                        toast.error('Location data not available');
                                      }
                                    }
                                  }}
                                  className="cursor-pointer"
                                >
                                  <MapPin className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
                                </button>
                        </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-semibold text-gray-900">Location</div>
                                <div className="text-xs text-gray-500">
                                  {(() => {
                                    const customer = job.customer as any;
                                    
                                    // First priority: Use visible_address from database (saved by admin)
                                    const visibleAddress = customer?.visible_address;
                                    if (visibleAddress && String(visibleAddress).trim()) {
                                      const visibleAddr = String(visibleAddress).trim();
                                      return (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            markJobAsSeen(job.id);
                                            setSelectedJobForAddress(job);
                                            setAddressDialogOpen(prev => ({ ...prev, [job.id]: true }));
                                          }}
                                          className="text-left text-black hover:text-gray-700 hover:underline transition-colors cursor-pointer font-medium w-full text-left"
                                          title="Click to view full address"
                                        >
                                          {visibleAddr}
                                        </button>
                                      );
                                    }
                                    
                                    // Fallback: Extract location from address.street if visible_address is missing
                                    const addressStreet = customer?.address?.street || '';
                                    if (addressStreet && String(addressStreet).trim()) {
                                      const extractedLocation = extractLocationFromAddressString(String(addressStreet).trim());
                                      if (extractedLocation) {
                                        return (
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              markJobAsSeen(job.id);
                                              setSelectedJobForAddress(job);
                                              setAddressDialogOpen(prev => ({ ...prev, [job.id]: true }));
                                            }}
                                            className="text-left text-black hover:text-gray-700 hover:underline transition-colors cursor-pointer font-medium w-full text-left"
                                            title="Click to view full address"
                                          >
                                            {extractedLocation}
                                          </button>
                                        );
                                      }
                                    }
                                    
                                    // Fallback: try address.area
                                    const area = customer?.address?.area;
                                    if (area && String(area).trim()) {
                                      return (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            markJobAsSeen(job.id);
                                            setSelectedJobForAddress(job);
                                            setAddressDialogOpen(prev => ({ ...prev, [job.id]: true }));
                                          }}
                                          className="text-left text-black hover:text-gray-700 hover:underline transition-colors cursor-pointer font-medium w-full text-left"
                                          title="Click to view full address"
                                        >
                                          {String(area).trim()}
                                        </button>
                                      );
                                    }
                                    
                                    // If no location found, check if there's any address
                                    return customer?.address ? (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          markJobAsSeen(job.id);
                                          setSelectedJobForAddress(job);
                                          setAddressDialogOpen(prev => ({ ...prev, [job.id]: true }));
                                        }}
                                        className="text-left text-gray-500 hover:text-gray-700 hover:underline transition-colors cursor-pointer"
                                        title="Click to view full address"
                                      >
                                        View Address
                                      </button>
                                    ) : 'No location';
                                  })()}
                          </div>
                            </div>
                      </div>
                        </div>
                        
                          {/* Photos */}
                          {(() => {
                            const customerId = (job.customer as any)?.id || job.customer?.id;
                            return (
                              <div className="bg-white rounded-lg p-3 border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all duration-200">
                                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                                  <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                    <button
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        markJobAsSeen(job.id);
                                        if (customerId) {
                                          setLoadingCustomerPhotos(true);
                                          const allCustomerPhotos = await getAllCustomerPhotos(customerId);
                                          setSelectedJobPhotos({ 
                                            jobId: job.id, 
                                            photos: allCustomerPhotos,
                                            customerId 
                                          });
                                          setPhotosDialogOpen(true);
                                          setLoadingCustomerPhotos(false);
                                        } else {
                                          // Fallback to job photos only - only load when button is clicked
                                          const jobPhotos = getAllJobPhotos(job);
                                          setSelectedJobPhotos({ jobId: job.id, photos: jobPhotos });
                                          setPhotosDialogOpen(true);
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
                                        : customerId
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
                                      handleWhatsAppClick(job.customer?.phone || '');
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
            })}
            
            {/* Daily Summary for Completed Jobs */}
            {statusFilter === 'COMPLETED' && filteredJobs.length > 0 && (() => {
              let totalCash = 0;
              let totalOnline = 0;
              let totalAmount = 0;
              
              filteredJobs.forEach((job) => {
                const paymentAmount = (job as any).payment_amount || (job as any).actual_cost || 0;
                const paymentMethod = (job as any).payment_method || '';
                if (paymentAmount <= 0) return;
                totalAmount += paymentAmount;
                if (paymentMethod === 'PARTIAL') {
                  try {
                    const req = typeof (job as any).requirements === 'string' ? JSON.parse((job as any).requirements) : (job as any).requirements || [];
                    const arr = Array.isArray(req) ? req : [];
                    const partialReq = arr.find((r: any) => r?.partial_cash_amount != null || r?.partial_online_amount != null);
                    totalCash += Number(partialReq?.partial_cash_amount) || 0;
                    totalOnline += Number(partialReq?.partial_online_amount) || 0;
                  } catch {
                    totalCash += paymentAmount;
                  }
                } else if (paymentMethod === 'CASH') {
                  totalCash += paymentAmount;
                } else if (paymentMethod && paymentMethod !== 'CASH') {
                  totalOnline += paymentAmount;
                }
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
                  
                  return (
                    <>
                      {/* Job Info */}
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <div className="flex items-center gap-2 mb-3">
                          <div className={`w-5 h-5 ${customerAMCStatus[customer?.id] ? 'bg-green-500' : 'bg-gray-400'} rounded-sm flex items-center justify-center relative`}>
                            <div className="w-2.5 h-2.5 bg-white rounded-sm"></div>
                            {customerAMCStatus[customer?.id] && (
                              <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-600 rounded-full border border-white" title="Active AMC"></div>
                            )}
                          </div>
                          <span className="font-bold text-xl text-gray-900">
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
                              const customer = job?.customer as any;
                              const jobData = job as any;
                              
                              // Helper function to check if value is valid (not empty, not "Not specified")
                              const isValidValue = (val: string) => {
                                return val && 
                                  val !== 'Not specified' && 
                                  val.toLowerCase() !== 'not specified' && 
                                  val.trim() !== '';
                              };
                              
                              // Get job brand/model
                              const jobBrand = jobData.brand || job?.brand || '';
                              const customerBrand = customer?.brand || '';
                              
                              // Check if job has valid brand (treat "Not specified" as empty)
                              const hasValidJobBrand = isValidValue(jobBrand);
                              
                              let brand = hasValidJobBrand ? jobBrand : '';
                              
                              // If job doesn't have valid brand, try to get from customer
                              if (!brand && customerBrand) {
                                const jobServiceType = (jobData.service_type || job?.service_type || '').toUpperCase();
                                
                                // If customer has comma-separated values, parse them based on service type
                                if (customerBrand.includes(',')) {
                                  const brands = customerBrand.split(',').map((b: string) => b.trim());
                                  
                                  // For RO jobs, use first brand; for SOFTENER, use second if available
                                  if (jobServiceType === 'RO' || jobServiceType === '') {
                                    brand = brands[0] || '';
                                  } else if (jobServiceType === 'SOFTENER' && brands.length > 1) {
                                    brand = brands[1] || brands[0] || '';
                                  } else {
                                    brand = brands[0] || '';
                                  }
                                } else {
                                  // Customer has single brand value - only use if valid
                                  if (isValidValue(customerBrand)) brand = customerBrand;
                                }
                              }
                              
                              // Get model if available
                              const jobModel = jobData.model || job?.model || '';
                              const customerModel = customer?.model || '';
                              
                              const hasValidJobModel = isValidValue(jobModel);
                              let model = hasValidJobModel ? jobModel : '';
                              
                              // If job doesn't have valid model, try to get from customer
                              if (!model && customerModel) {
                                const jobServiceType = (jobData.service_type || job?.service_type || '').toUpperCase();
                                
                                // If customer has comma-separated values, parse them based on service type
                                if (customerModel.includes(',')) {
                                  const models = customerModel.split(',').map((m: string) => m.trim());
                                  
                                  // For RO jobs, use first model; for SOFTENER, use second if available
                                  if (jobServiceType === 'RO' || jobServiceType === '') {
                                    model = models[0] || '';
                                  } else if (jobServiceType === 'SOFTENER' && models.length > 1) {
                                    model = models[1] || models[0] || '';
                                  } else {
                                    model = models[0] || '';
                                  }
                                } else {
                                  // Customer has single model value - only use if valid
                                  if (isValidValue(customerModel)) model = customerModel;
                                }
                              }
                              
                              // Filter out "Not specified" values - only show if we have actual values
                              const validBrand = isValidValue(brand) ? brand.trim() : '';
                              const validModel = isValidValue(model) ? model.trim() : '';
                              
                              if (validBrand || validModel) {
                                const displayText = validBrand && validModel 
                                  ? `${validBrand} - ${validModel}` 
                                  : validBrand || validModel;
                                
                                return (
                                  <p><strong>Equipment:</strong> {displayText}</p>
                                );
                              }
                              return null;
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
                            <p><strong>Name:</strong> {customer?.full_name || 'N/A'}</p>
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
                {confirmStartJobDialog.job && hasJobInProgress() && ((confirmStartJobDialog.job as any).status || confirmStartJobDialog.job.status) !== 'EN_ROUTE' && ((confirmStartJobDialog.job as any).status || confirmStartJobDialog.job.status) !== 'IN_PROGRESS' 
                  ? 'You already have a job in progress. Starting a new job will mark the current job as paused. Are you sure you want to start this new job?'
                  : 'Are you sure you want to start this job? This will mark you as en route to the job location.'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {confirmStartJobDialog.job && (
              <div className="bg-gray-50 p-3 rounded-lg text-sm">
                <p><strong>Job:</strong> {(confirmStartJobDialog.job.customer as any)?.full_name || 'Unknown'}</p>
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
          }
        }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Start Work</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to start work on this job? This will mark the job as in progress.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {confirmStartWorkDialog.job && (
              <div className="bg-gray-50 p-3 rounded-lg text-sm">
                <p><strong>Job:</strong> {(confirmStartWorkDialog.job.customer as any)?.full_name || 'Unknown'}</p>
                <p><strong>Service:</strong> {(confirmStartWorkDialog.job as any).service_type || confirmStartWorkDialog.job.serviceType || 'N/A'}</p>
              </div>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setConfirmStartWorkDialog({ open: false, job: null })}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (confirmStartWorkDialog.job) {
                    performStartWork(confirmStartWorkDialog.job);
                    setConfirmStartWorkDialog({ open: false, job: null });
                  }
                }}
                className="bg-orange-600 hover:bg-orange-700"
              >
                Start Work
              </AlertDialogAction>
            </AlertDialogFooter>
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
                <p><strong>Job:</strong> {(confirmCompleteJobDialog.job.customer as any)?.full_name || 'Unknown'}</p>
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
                    const amount = parseFloat(billAmount || '0');
                    const formatted = amount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
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
                <Input
                  id="ongoing-date"
                  type="date"
                  value={moveToOngoingDate}
                  onChange={(e) => setMoveToOngoingDate(e.target.value)}
                  className="mt-1"
                  required
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
                    <strong>Customer:</strong> {(selectedJobForDeny.customer as any)?.full_name || 'Unknown'}
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
        <Dialog open={completeDialogOpen} onOpenChange={(open) => {
          if (!open && !isSubmittingJobCompletion) {
            // Only allow closing if not submitting (data is safe in localStorage)
            setCompleteDialogOpen(false);
            setSelectedJobForComplete(null);
            setCompletionNotes('');
            setCompleteJobStep(1);
            setBillAmount('');
            setBillPhotos([]);
            const today = new Date().toISOString().split('T')[0];
            setAmcDateGiven(today);
            setAmcEndDate('');
            setAmcYears(0);
            setAmcIncludesPrefilter(false);
            setHasAMC(null);
            setPaymentMode('');
            setCustomerHasPrefilter(null);
        setRawWaterTds('');
            setQrCodeType('');
            setSelectedQrCodeId('');
            setPaymentScreenshot('');
            setIsSubmittingJobCompletion(false);
          }
        }}>
          <DialogContent className="w-[95vw] sm:w-[500px] max-w-[500px] h-[85vh] sm:h-[600px] max-h-[85vh] flex flex-col p-0">
            <DialogHeader className="px-6 pt-6 pb-4 flex-shrink-0 border-b">
              <DialogTitle>Complete Job</DialogTitle>
              <DialogDescription>
                {isSubmittingJobCompletion ? (
                  <span className="text-blue-600 font-medium">
                    💾 Submitting job completion... Your data is saved safely.
                  </span>
                ) : (
                  <>
                    {completeJobStep === 1 && 'Enter the bill amount for this job'}
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
              className="flex-1 overflow-y-auto px-6 py-4"
              style={{
                WebkitOverflowScrolling: 'touch',
                touchAction: 'pan-y',
                overscrollBehavior: 'contain',
                minHeight: 0, // Important for flex children to allow shrinking
                position: 'relative', // Ensure proper stacking context
              }}
            >
              {selectedJobForComplete && (
                <div className="p-3 bg-gray-50 rounded-lg mb-4">
                  <div className="text-sm font-medium text-gray-900">
                    Job: {(selectedJobForComplete as any).job_number || selectedJobForComplete.jobNumber}
                  </div>
                  <div className="text-sm text-gray-600">
                    {(selectedJobForComplete.serviceType || (selectedJobForComplete as any).service_type || 'N/A')} - {(selectedJobForComplete.serviceSubType || (selectedJobForComplete as any).service_sub_type || 'N/A')}
                  </div>
                  <div className="text-sm text-gray-600">
                    Customer: {
                      selectedJobForComplete.customer?.fullName || 
                      (selectedJobForComplete.customer as any)?.full_name ||
                      (selectedJobForComplete.customer as any)?.name ||
                      'Unknown'
                    }
                  </div>
                </div>
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
                    completeJobStep >= (requiresOtp() ? 7 : 6) ? 'bg-black' : 'bg-gray-200'
                  }`}></div>
                  
                  {/* Step 6 - Prefilter (or Step 7 - OTP if required) */}
                  {requiresOtp() ? (
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

              {/* Step 1: Bill Amount */}
              {completeJobStep === 1 && (
                <div className="space-y-4">
              <div>
                    <Label htmlFor="bill-amount">Bill Amount *</Label>
                    <Input
                      id="bill-amount"
                      type="number"
                      placeholder="Enter bill amount"
                      value={billAmount}
                      onChange={(e) => {
                        setBillAmount(e.target.value);
                      }}
                      className="mt-1"
                      min="0"
                      step="0.01"
                    />
                    {billAmount && parseFloat(billAmount) > 0 && (
                      <p className="text-sm text-gray-600 mt-2">
                        Bill Amount: ₹{(() => {
                          const amount = parseFloat(billAmount || '0');
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
                <div className="space-y-4">
                  <div>
                    <Label>Upload Bill Photo (Optional)</Label>
                    <ImageUpload
                      onImagesChange={(images) => {
                        setBillPhotos(images);
                      }}
                      initialImages={billPhotos}
                      onUploadStateChange={setIsBillPhotosUploading}
                      maxImages={5}
                      folder="bills"
                      title=""
                      description=""
                      maxWidth={1024}
                      quality={0.5}
                      aggressiveCompression={true}
                    />
                  </div>
                </div>
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
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                        <p className="text-sm text-blue-800">
                          <strong>Note:</strong> This information is for reference only. The admin will generate the official AMC contract with a summary. If you enter 0 years, it will be treated as no AMC.
                        </p>
                      </div>
                      
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                            <Label htmlFor="amc-start-date" className="text-sm font-medium">AMC Start Date</Label>
                    <Input
                          id="amc-start-date"
                          type="date"
                          value={amcDateGiven}
                      onChange={(e) => {
                            const date = e.target.value;
                            setAmcDateGiven(date);
                            if (date && amcYears > 0) {
                              const endDate = new Date(date);
                              endDate.setFullYear(endDate.getFullYear() + amcYears);
                              endDate.setDate(endDate.getDate() - 1);
                              setAmcEndDate(endDate.toISOString().split('T')[0]);
                            } else {
                              setAmcEndDate('');
                            }
                          }}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="amc-years" className="text-sm font-medium">Number of Years</Label>
                        <Select
                          value={amcYears > 0 ? amcYears.toString() : ''}
                          onValueChange={(value) => {
                            const years = value ? parseInt(value) : 0;
                            setAmcYears(years);
                            // If years is 0 or not selected, treat as no AMC
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
                          <SelectTrigger id="amc-years" className="mt-1">
                            <SelectValue placeholder="Select years (optional)" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">1 Year</SelectItem>
                            <SelectItem value="2">2 Years</SelectItem>
                            <SelectItem value="3">3 Years</SelectItem>
                          </SelectContent>
                        </Select>
                        {amcYears === 0 && (
                          <p className="text-xs text-gray-500 mt-1">If not selected, it means no AMC</p>
                        )}
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="amc-amount" className="text-sm font-medium">AMC Amount (Reference Only)</Label>
                      <Input
                        id="amc-amount"
                        type="number"
                        placeholder="Enter AMC amount (optional)"
                        value={amcAmount}
                        onChange={(e) => {
                          setAmcAmount(e.target.value);
                      }}
                      className="mt-1"
                      min="0"
                      step="0.01"
                    />
                  </div>

                  <div>
                      <Label htmlFor="amc-includes-prefilter" className="text-sm font-medium mb-2 block">Includes Prefilter</Label>
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id="amc-includes-prefilter"
                          checked={amcIncludesPrefilter}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setAmcIncludesPrefilter(checked);
                          }}
                          className="w-4 h-4"
                        />
                        <Label htmlFor="amc-includes-prefilter" className="text-sm cursor-pointer">
                          Customer's AMC includes prefilter maintenance
                        </Label>
                      </div>
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
                      className="mt-1"
                />
                      <p className="text-xs text-gray-500 mt-1">
                        This information is for admin reference only. The admin will create the official AMC contract.
                      </p>
              </div>
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
                        onValueChange={(value: 'CASH' | 'ONLINE' | 'PARTIAL') => {
                          setPaymentMode(value);
                          if (value === 'CASH') {
                            setQrCodeType('');
                            setSelectedQrCodeId('');
                            setPaymentScreenshot('');
                          }
                          if (value === 'PARTIAL') {
                            setPartialCashAmount('');
                            setPartialOnlineAmount('');
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
                        </SelectContent>
                      </Select>
                    </div>

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
                              const v = e.target.value;
                              setPartialCashAmount(v);
                              const bill = parseFloat(billAmount) || 0;
                              if (v !== '' && !/^\s*$/.test(v)) {
                                const cash = parseFloat(v.replace(/,/g, '')) || 0;
                                if (!Number.isNaN(cash) && bill >= 0) {
                                  const online = Math.max(0, Math.round((bill - cash) * 100) / 100);
                                  setPartialOnlineAmount(online === Math.floor(online) ? String(Math.floor(online)) : online.toFixed(2));
                                }
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
                              const v = e.target.value;
                              setPartialOnlineAmount(v);
                              const bill = parseFloat(billAmount) || 0;
                              if (v !== '' && !/^\s*$/.test(v)) {
                                const online = parseFloat(v.replace(/,/g, '')) || 0;
                                if (!Number.isNaN(online) && bill >= 0) {
                                  const cash = Math.max(0, Math.round((bill - online) * 100) / 100);
                                  setPartialCashAmount(cash === Math.floor(cash) ? String(Math.floor(cash)) : cash.toFixed(2));
                                }
                              }
                            }}
                            className="mt-1"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {(paymentMode === 'ONLINE' || paymentMode === 'PARTIAL') && (
                    <div className="space-y-4 pl-4 border-l-2 border-gray-200">
                      <div>
                        <Label htmlFor="qr-code-type">Select QR Code *</Label>
                        <Select 
                          value={selectedQrCodeId} 
                          onValueChange={(value) => {
                            setSelectedQrCodeId(value);
                            // Set QR code type based on selection
                            let qrType = '';
                            let qrUrl: string | undefined;
                            let qrName: string | undefined;
                            
                            if (value.startsWith('common_')) {
                              qrType = 'common';
                              const qrId = value.replace('common_', '');
                              const selectedQr = commonQrCodes.find(qr => qr.id === qrId);
                              if (selectedQr) {
                                qrUrl = selectedQr.qrCodeUrl;
                                qrName = selectedQr.name;
                              }
                            } else if (value.startsWith('technician_')) {
                              qrType = 'technician';
                              const techId = value.replace('technician_', '');
                              const selectedTech = technicians.find(t => t.id === techId);
                              if (selectedTech && selectedTech.qrCode) {
                                qrUrl = selectedTech.qrCode;
                                qrName = selectedTech.fullName || 'Technician';
                              }
                            }
                            
                            setQrCodeType(qrType);
                          }}
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue placeholder="Select QR code" />
                          </SelectTrigger>
                          <SelectContent className="!z-[100]">
                            {/* Common QR Codes - show by name */}
                            {commonQrCodes.length === 0 && technicians.filter(t => (t as any).qrCode).length === 0 ? (
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
                                  .filter(t => (t as any).qrCode && (t as any).qrCode.trim() !== '')
                                  .map((tech) => (
                                    <SelectItem key={`technician_${tech.id}`} value={`technician_${tech.id}`}>
                                      {tech.fullName}'s QR Code
                            </SelectItem>
                                  ))}
                              </>
                            )}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Display selected QR code image immediately */}
                      {selectedQrCodeId && (
                        <div className="mt-4 p-4 bg-primary/10 border border-primary rounded-lg">
                          <p className="text-sm font-semibold text-primary mb-3 text-center">
                            QR Code - Show to Customer
                          </p>
                          <div className="flex justify-center">
                            {selectedQrCodeId.startsWith('common_') ? (() => {
                              const qrId = selectedQrCodeId.replace('common_', '');
                              const selectedQr = commonQrCodes.find(qr => qr.id === qrId);
                              if (!selectedQr) {
                                return (
                                  <div className="text-center p-4">
                                    <p className="text-sm text-red-500">QR code not found</p>
                                  </div>
                                );
                              }
                              return (
                                <div className="text-center">
                                  <p className="text-sm font-medium mb-3 text-gray-700">{selectedQr.name}</p>
                                  <img 
                                    src={selectedQr.qrCodeUrl} 
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
                              const selectedTech = technicians.find(t => t.id === techId);
                              if (!selectedTech || !(selectedTech as any).qrCode) {
                                return (
                                  <div className="text-center p-4">
                                    <p className="text-sm text-red-500">QR code not found</p>
                                    <p className="text-xs text-gray-500 mt-1">Technician QR code not available</p>
                                  </div>
                                );
                              }
                              return (
                                <div className="text-center">
                                  <p className="text-sm font-medium mb-3 text-gray-700">
                                    {selectedTech.fullName}'s QR Code
                                  </p>
                                  <img 
                                    src={(selectedTech as any).qrCode} 
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
                <div className="space-y-4">
                  <div>
                        <Label>Payment Screenshot (Optional)</Label>
                    <p className="text-sm text-gray-500 mb-2">
                      {paymentMode === 'ONLINE' 
                        ? 'Upload payment confirmation screenshot' 
                        : 'Upload payment screenshot if available (optional)'}
                    </p>
                        <ImageUpload
                          onImagesChange={(images) => {
                            setPaymentScreenshot(images[0] || '');
                          }}
                          initialImages={paymentScreenshot ? [paymentScreenshot] : []}
                          onUploadStateChange={setIsPaymentScreenshotUploading}
                          maxImages={1}
                          folder="payment-receipts"
                          title=""
                          description=""
                          maxWidth={800}
                          quality={0.3}
                          aggressiveCompression={true}
                          useSecondaryAccount={true}
                        />
                      </div>
                  </div>
                )}

              {/* Step 7: OTP Verification */}
              {completeJobStep === 7 && requiresOtp() && (
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
                      The OTP was generated when this job was created
                    </p>
                  </div>
                </div>
              )}

              {/* Step 6: Prefilter Question - only show if not softener service */}
              {completeJobStep === 6 && isSoftenerService() && (
                <div className="space-y-4">
                  <div className="text-center py-8">
                    <p className="text-gray-600">Completing job...</p>
                  </div>
                </div>
              )}
              {completeJobStep === 6 && !isSoftenerService() && (
                <div className="space-y-4">
                  <div className="space-y-3">
                    <Label className="text-base font-semibold">Does the customer have a prefilter?</Label>
                    <div className="grid grid-cols-2 gap-4">
                      <button
                        type="button"
                        onClick={() => {
                          setCustomerHasPrefilter(true);
                        }}
                        className={`p-4 rounded-lg border-2 transition-all duration-200 ${
                          customerHasPrefilter === true
                            ? 'border-black bg-black text-white shadow-md'
                            : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex flex-col items-center gap-2">
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                            customerHasPrefilter === true
                              ? 'border-white bg-white'
                              : 'border-gray-400'
                          }`}>
                            {customerHasPrefilter === true && (
                              <div className="w-2.5 h-2.5 rounded-full bg-black"></div>
                            )}
                          </div>
                          <span className="font-medium text-sm">Yes</span>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCustomerHasPrefilter(false);
                        }}
                        className={`p-4 rounded-lg border-2 transition-all duration-200 ${
                          customerHasPrefilter === false
                            ? 'border-black bg-black text-white shadow-md'
                            : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex flex-col items-center gap-2">
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                            customerHasPrefilter === false
                              ? 'border-white bg-white'
                              : 'border-gray-400'
                          }`}>
                            {customerHasPrefilter === false && (
                              <div className="w-2.5 h-2.5 rounded-full bg-black"></div>
                            )}
                          </div>
                          <span className="font-medium text-sm">No</span>
                        </div>
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-base font-semibold">Raw water TDS (ppm) <span className="text-red-600">*</span></Label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      placeholder="e.g. 500"
                      value={rawWaterTds}
                      onChange={(e) => setRawWaterTds(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      className="max-w-[140px]"
                      required
                    />
                  </div>
                  {selectedJobForComplete?.customer && (
                    <div className="pt-2 border-t border-gray-200">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-gray-600 hover:text-gray-900"
                        onClick={() => {
                          const customerId = (selectedJobForComplete.customer as any)?.id ?? (selectedJobForComplete as any).customer_id;
                          if (customerId) {
                            setReminderEntity({ type: 'customer', id: customerId });
                            const name = (selectedJobForComplete.customer as any)?.full_name || (selectedJobForComplete.customer as any)?.fullName || 'Customer';
                            const code = (selectedJobForComplete.customer as any)?.customer_id || (selectedJobForComplete.customer as any)?.customerId || '';
                            setReminderContextLabel(code ? `${name} (${code})` : name);
                            setAddReminderDialogOpen(true);
                          }
                        }}
                      >
                        <Bell className="w-4 h-4 mr-2" />
                        Set reminder for this customer
                      </Button>
                    </div>
                  )}
                </div>
              )}

            </div>

            <DialogFooter className="px-6 py-4 flex-shrink-0 border-t">
              <Button
                variant="outline"
                onClick={() => {
                  if (completeJobStep > 1) {
                    setCompleteJobStep((prev) => {
                      // If going back from step 6 and OTP is required, go to step 7, not step 5
                      if (prev === 6 && requiresOtp()) {
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
                  setCompleteDialogOpen(false);
                  setSelectedJobForComplete(null);
                  setCompletionNotes('');
                    setCompleteJobStep(1);
                    setBillAmount('');
                    setBillPhotos([]);
                    const today = new Date().toISOString().split('T')[0];
                    setAmcDateGiven(today);
                    setAmcEndDate('');
                    setAmcYears(0);
                    setAmcIncludesPrefilter(false);
                    setHasAMC(null);
                    setPaymentMode('');
                    setCustomerHasPrefilter(null);
        setRawWaterTds('');
      setQrCodeType('');
      setSelectedQrCodeId('');
      setPaymentScreenshot('');
      setOtpInput(['', '', '', '']);
      setOtpError('');
      otpInputRefs.current = [];
                  }
                }}
              >
                {completeJobStep > 1 ? 'Back' : 'Cancel'}
              </Button>
              {completeJobStep === 2 && (
                <Button
                  variant="outline"
                  onClick={() => {
                    // Skip bill photo step
                    saveJobCompletionProgress(selectedJobForComplete.id, {
                      billPhotos: [],
                      billAmount,
                      currentStep: 3,
                    });
                    setCompleteJobStep(3);
                  }}
                >
                  Skip
                </Button>
              )}
              {/* Skip button for step 3 - only show if step 3 is visible (not skipped) */}
              {completeJobStep === 3 && !isBillAmountZero() && !isSoftenerService() && (
                <Button
                  variant="outline"
                  onClick={() => {
                    // Skip AMC step - go to payment step (step 4)
                    // Since we're only showing this button when bill is not zero and not softener,
                    // we always go to step 4
                    saveJobCompletionProgress(selectedJobForComplete.id, {
                      billPhotos,
                      billAmount,
                      paymentMode: paymentMode as 'CASH' | 'ONLINE' | '',
                      paymentScreenshot,
                      qrCodeType,
                      selectedQrCodeId,
                      customerHasPrefilter,
                      hasAMC: false,
                      amcDateGiven: '',
                      amcEndDate: '',
                      amcYears: 0,
                      amcIncludesPrefilter: false,
                      amcAdditionalInfo: '',
                      currentStep: 4,
                    });
                    setCompleteJobStep(4);
                  }}
                >
                  Skip
                </Button>
              )}
              <Button
                onClick={handleCompleteJobSubmit}
                className="bg-black hover:bg-gray-800 !text-white font-semibold"
                disabled={
                  isSubmittingJobCompletion ||
                  // Only check upload states on final step (step 6) - allow proceeding on steps 2 and 5
                  (completeJobStep === 6 && (isBillPhotosUploading || isPaymentScreenshotUploading)) ||
                  // Step 6 validation: Raw water TDS required for RO jobs
                  (completeJobStep === 6 && !isSoftenerService() && !rawWaterTds.trim()) ||
                  // Step 4 validation: only require payment mode if bill amount is not zero
                  (completeJobStep === 4 && !isBillAmountZero() && !paymentMode) || 
                  (completeJobStep === 4 && !isBillAmountZero() && (paymentMode === 'ONLINE' || paymentMode === 'PARTIAL') && (paymentMode === 'ONLINE' ? !selectedQrCodeId : (parseFloat(partialOnlineAmount) > 0 && !selectedQrCodeId))) ||
                  // Step 7 validation: require OTP if step is 7
                  (completeJobStep === 7 && otpInput.join('').length !== 4)
                }
              >
                {isSubmittingJobCompletion || (completeJobStep === 6 && (isBillPhotosUploading || isPaymentScreenshotUploading)) ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    {completeJobStep === 6 && (isBillPhotosUploading || isPaymentScreenshotUploading)
                      ? 'Waiting for uploads...' 
                      : completeJobStep === 6 
                        ? 'Submitting...' 
                        : 'Saving...'}
                  </>
                ) : (
                  // Show "Complete Job" on step 6, or if we're on step 3/5 and skipping to submit (but not if OTP is required)
                  (completeJobStep === 6 || (completeJobStep === 3 && isBillAmountZero() && isSoftenerService() && !requiresOtp()) || (completeJobStep === 5 && isSoftenerService() && !requiresOtp())) 
                    ? 'Complete Job' 
                    : 'Next'
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
              <DialogDescription>
                Choose a phone number to call for {selectedCustomerPhone?.full_name || 'customer'}
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


        {/* Photos Dialog */}
        <Dialog open={photosDialogOpen} onOpenChange={setPhotosDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
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
                        onClick={() => window.open(photo, '_blank', 'noopener,noreferrer')}
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
              }
            }}
          >
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Full Address</DialogTitle>
                <DialogDescription>
                  Complete address for {(selectedJobForAddress.customer as any)?.full_name || (selectedJobForAddress.customer as any)?.fullName || 'Customer'}
                </DialogDescription>
              </DialogHeader>
              <div className="py-4 space-y-4">
                <div className="text-sm text-gray-900 whitespace-pre-wrap break-words">
                  {(() => {
                    const customer = selectedJobForAddress.customer as any;
                    const address = customer?.address || (selectedJobForAddress as any)?.service_address;
                    return formatAddressForDisplay(address) || 'No address available';
                  })()}
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setAddressDialogOpen(prev => ({ ...prev, [selectedJobForAddress.id]: false }));
                    setSelectedJobForAddress(null);
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
                      
                      // Load AMC contract details
                      const { data, error } = await supabase
                        .from('amc_contracts')
                        .select('*')
                        .eq('customer_id', customerId)
                        .eq('status', 'ACTIVE')
                        .order('start_date', { ascending: false })
                        .limit(1)
                        .single();
                      
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
              {/* Reports Button - Show for all jobs */}
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={async () => {
                  const customer = (selectedJobForOptions.customer as any);
                  if (customer) {
                    setSelectedCustomerForReport(customer);
                    setCustomerReportDialogOpen(true);
                    setOptionsDialogOpen(prev => ({ ...prev, [selectedJobForOptions.id]: false }));
                    setSelectedJobForOptions(null);
                  }
                }}
              >
                <FileText className="w-4 h-4 mr-2" />
                Reports
              </Button>
              {(selectedJobForOptions.status === 'ASSIGNED' || selectedJobForOptions.status === 'EN_ROUTE' || selectedJobForOptions.status === 'IN_PROGRESS') && (
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => {
                    setOptionsDialogOpen(prev => ({ ...prev, [selectedJobForOptions.id]: false }));
                    handleScheduleFollowUp(selectedJobForOptions);
                    setSelectedJobForOptions(null);
                  }}
                >
                  <CalendarPlus className="w-4 h-4 mr-2" />
                  Schedule Follow-up
                </Button>
              )}
              {(selectedJobForOptions.status === 'ASSIGNED' || selectedJobForOptions.status === 'EN_ROUTE') && (
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

      {/* Customer Report Dialog */}
      <Dialog open={customerReportDialogOpen} onOpenChange={setCustomerReportDialogOpen}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Customer Report - {selectedCustomerForReport?.full_name || selectedCustomerForReport?.fullName || 'Unknown'}</DialogTitle>
            <DialogDescription>
              Complete service history and job details
            </DialogDescription>
          </DialogHeader>
          
          {selectedCustomerForReport && (() => {
            // Use fetched customer report jobs (filtered to completed)
            const completedJobs = customerReportJobs
              .filter(job => {
                const jobStatus = (job as any).status || job.status;
                return jobStatus === 'COMPLETED';
              })
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
                      <span className="text-gray-500">Name:</span> {selectedCustomerForReport.full_name || selectedCustomerForReport.fullName}
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
                        // Format date as "January 5th 2026" with 12-hour time format
                        const formattedCompletedAt = completedAt ? (() => {
                          const date = new Date(completedAt);
                          const day = date.getDate();
                          const month = date.toLocaleString('en-US', { month: 'long' });
                          const year = date.getFullYear();
                          // Get ordinal suffix (1st, 2nd, 3rd, 4th, etc.)
                          const getOrdinalSuffix = (n: number) => {
                            const s = ['th', 'st', 'nd', 'rd'];
                            const v = n % 100;
                            return s[(v - 20) % 10] || s[v] || s[0];
                          };
                          // Format time as 12-hour format (5:30 PM)
                          const hours = date.getHours();
                          const minutes = date.getMinutes();
                          const ampm = hours >= 12 ? 'PM' : 'AM';
                          const displayHours = hours % 12 || 12;
                          const displayMinutes = minutes.toString().padStart(2, '0');
                          const timeStr = `${displayHours}:${displayMinutes} ${ampm}`;
                          return `${month} ${day}${getOrdinalSuffix(day)} ${year} at ${timeStr}`;
                        })() : null;
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
                            // Try to find technician by ID from allTechniciansForReports (includes all technicians, not just those with QR codes)
                            const completedByTechnician = allTechniciansForReports.find(tech => tech.id === completedBy);
                            completedByName = completedByTechnician?.fullName || completedByTechnician?.full_name || 'Technician';
                          }
                        }
                        
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
                        
                        const amcInfo = requirements.find((r: any) => r?.amc_info)?.amc_info || null;
                        const qrPhotos = requirements.find((r: any) => r?.qr_photos)?.qr_photos || null;
                        
                        // Get payment screenshot from qr_photos (primary source)
                        let paymentScreenshot: string | null = null;
                        if (qrPhotos?.payment_screenshot) {
                          const extractedUrls = extractPhotoUrls([qrPhotos.payment_screenshot]);
                          paymentScreenshot = extractedUrls.length > 0 ? extractedUrls[0] : null;
                          console.log('📸 Payment screenshot from qr_photos:', paymentScreenshot);
                        }
                        
                        // Get all photos from after_photos field (contains both bill photos + payment screenshot)
                        const afterPhotos = Array.isArray((job as any).after_photos || job.afterPhotos) 
                          ? ((job as any).after_photos || job.afterPhotos) 
                          : [];
                        const extractedAfterPhotos = extractPhotoUrls(afterPhotos);
                        console.log('📸 All photos from after_photos:', extractedAfterPhotos);
                        
                        // Get bill photos from requirements.bill_photos (fallback)
                        let billPhotosFromReq = requirements.find((r: any) => r?.bill_photos)?.bill_photos || [];
                        const extractedBillPhotosFromReq = extractPhotoUrls(billPhotosFromReq);
                        
                        // Determine bill photos: use after_photos (which includes payment screenshot) but exclude payment screenshot if we found it
                        let billPhotos: string[] = [];
                        
                        if (extractedAfterPhotos.length > 0) {
                          // after_photos contains both bill photos and payment screenshot
                          if (paymentScreenshot) {
                            // Filter out payment screenshot from after_photos to get just bill photos
                            billPhotos = extractedAfterPhotos.filter(url => {
                              // Compare URLs (handle both full URLs and normalized URLs)
                              const normalizedUrl1 = url.trim().toLowerCase();
                              const normalizedUrl2 = paymentScreenshot!.trim().toLowerCase();
                              return normalizedUrl1 !== normalizedUrl2;
                            });
                            console.log('📸 Filtered bill photos (excluded payment screenshot):', billPhotos);
                          } else {
                            // Payment screenshot not found in qr_photos, but might be in after_photos
                            // Use all after_photos as bill photos (payment screenshot will be shown if found later)
                            billPhotos = extractedAfterPhotos;
                          }
                        } else {
                          // No after_photos, use bill_photos from requirements
                          billPhotos = extractedBillPhotosFromReq;
                        }
                        
                        // If payment screenshot not in qr_photos but payment method is ONLINE and we have after_photos,
                        // the payment screenshot should be in after_photos (we added it there)
                        // Try to find it by comparing with bill_photos from requirements
                        if (!paymentScreenshot && (paymentMethod === 'ONLINE' || paymentMethod === 'UPI' || paymentMethod === 'CARD' || paymentMethod === 'BANK_TRANSFER')) {
                          if (extractedAfterPhotos.length > extractedBillPhotosFromReq.length) {
                            // There's at least one extra photo in after_photos - likely the payment screenshot
                            // Find the photo that's not in bill_photos from requirements
                            const paymentScreenshotCandidate = extractedAfterPhotos.find(url => 
                              !extractedBillPhotosFromReq.some(billUrl => {
                                const normalized1 = url.trim().toLowerCase();
                                const normalized2 = billUrl.trim().toLowerCase();
                                return normalized1 === normalized2;
                              })
                            );
                            if (paymentScreenshotCandidate) {
                              paymentScreenshot = paymentScreenshotCandidate;
                              // Remove it from bill photos
                              billPhotos = billPhotos.filter(url => {
                                const normalized1 = url.trim().toLowerCase();
                                const normalized2 = paymentScreenshot!.trim().toLowerCase();
                                return normalized1 !== normalized2;
                              });
                              console.log('📸 Found payment screenshot in after_photos:', paymentScreenshot);
                            }
                          }
                        }
                        
                        console.log('📸 Final bill photos count:', billPhotos.length);
                        console.log('📸 Final payment screenshot:', paymentScreenshot);
                        
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
                                {formattedCompletedAt && (
                                  <div className="text-xs text-gray-500 mt-1">
                                    Completed on {formattedCompletedAt}
                                  </div>
                                )}
                              </div>
                              <Badge className="bg-green-100 text-green-800">Completed</Badge>
                            </div>
                            
                            <div className="space-y-3 mt-4 pt-4 border-t border-gray-200">
                              {/* Bill Amount */}
                              {(actualCost || paymentAmount) && (
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-gray-700 w-32">Amount:</span>
                                  <span className="text-sm text-gray-900">₹{actualCost || paymentAmount}</span>
                                </div>
                              )}
                              
                              {/* Payment Mode - Only show if payment method exists (not null) */}
                              {/* For zero amount jobs, payment method will be null and this section won't display */}
                              {paymentMethod && (
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-gray-700 w-32">Payment Mode:</span>
                                  <span className="text-sm text-gray-900">{
                                    paymentMethod === 'CASH' ? 'Cash' : 
                                    paymentMethod === 'ONLINE' || paymentMethod === 'UPI' || paymentMethod === 'CARD' || paymentMethod === 'BANK_TRANSFER' ? 'Online' : 
                                    paymentMethod
                                  }</span>
                                </div>
                              )}
                              
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
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm font-medium text-gray-700 w-32">Lead Source:</span>
                                      <span className="text-sm text-gray-900">{leadSource}</span>
                                    </div>
                                  );
                                }
                                if (leadSource === 'Website') {
                                  const bookedAt = (job as any).created_at || (job as any).createdAt;
                                  if (bookedAt) {
                                    const formatted = new Date(bookedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
                                    return (
                                      <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium text-gray-700 w-32">Booked at:</span>
                                        <span className="text-sm text-gray-900">{formatted}</span>
                                      </div>
                                    );
                                  }
                                }
                                return null;
                              })()}

                              {/* Raw Water TDS - from selectedCustomerForReport (jobs from getByCustomerId don't have customer) */}
                              {((selectedCustomerForReport as any)?.raw_water_tds != null && (selectedCustomerForReport as any)?.raw_water_tds > 0) && (
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-gray-700 w-32">Raw Water TDS:</span>
                                  <span className="text-sm text-gray-900">{(selectedCustomerForReport as any).raw_water_tds} ppm</span>
                                </div>
                              )}
                              
                              {/* QR Code */}
                              {(paymentMethod === 'ONLINE' || paymentMethod === 'UPI' || paymentMethod === 'CARD' || paymentMethod === 'BANK_TRANSFER') && qrPhotos?.selected_qr_code_name && (
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-gray-700 w-32">QR Code:</span>
                                  <span className="text-sm text-gray-900">{qrPhotos.selected_qr_code_name}</span>
                                </div>
                              )}
                              
                              {/* Payment Screenshot & Bill Photos - Combined Section */}
                              {((paymentMethod === 'ONLINE' || paymentMethod === 'UPI' || paymentMethod === 'CARD' || paymentMethod === 'BANK_TRANSFER') && paymentScreenshot) || (billPhotos && Array.isArray(billPhotos) && billPhotos.length > 0) ? (
                                <div className="mt-3 pt-3 border-t border-gray-200">
                                  <div className="font-medium text-gray-900 mb-3">Payment & Bill Documents</div>
                                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                    {/* Payment Screenshot */}
                                    {(paymentMethod === 'ONLINE' || paymentMethod === 'UPI' || paymentMethod === 'CARD' || paymentMethod === 'BANK_TRANSFER') && paymentScreenshot && (
                                      <div 
                                        className="relative group cursor-pointer rounded-lg overflow-hidden border-2 border-blue-300 hover:border-blue-500 transition-all"
                                        onClick={() => {
                                          // Combine payment screenshot and bill photos for navigation
                                          const allPhotos = [paymentScreenshot, ...billPhotos];
                                          setSelectedBillPhotos(allPhotos);
                                          setSelectedPhoto({ url: paymentScreenshot, index: 0, total: allPhotos.length });
                                          setPhotoViewerOpen(true);
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
                                    {billPhotos && Array.isArray(billPhotos) && billPhotos.length > 0 && billPhotos.map((photo, idx) => {
                                      // Calculate index including payment screenshot if it exists
                                      const paymentScreenshotExists = (paymentMethod === 'ONLINE' || paymentMethod === 'UPI' || paymentMethod === 'CARD' || paymentMethod === 'BANK_TRANSFER') && paymentScreenshot;
                                      const photoIndex = paymentScreenshotExists ? idx + 1 : idx;
                                      const allPhotos = paymentScreenshotExists ? [paymentScreenshot, ...billPhotos] : billPhotos;
                                      
                                      return (
                                      <div 
                                        key={idx} 
                                        className="relative group cursor-pointer rounded-lg overflow-hidden border-2 border-green-300 hover:border-green-500 transition-all"
                                        onClick={() => {
                                          setSelectedBillPhotos(allPhotos);
                                          setSelectedPhoto({
                                            url: photo,
                                            index: photoIndex,
                                            total: allPhotos.length
                                          });
                                          setPhotoViewerOpen(true);
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
                              
                              {/* Completion Notes */}
                              {completionNotes && (
                                <div className="mt-3 pt-3 border-t border-gray-200">
                                  <div className="font-medium text-gray-900 mb-1">Notes:</div>
                                  <div className="text-sm text-gray-700 whitespace-pre-wrap">{completionNotes}</div>
                                </div>
                              )}
                              
                              {/* Completed By */}
                              {completedByName && (
                                <div className="mt-3 pt-3 border-t border-gray-200">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-gray-700 w-32">Completed By:</span>
                                    <span className="text-sm text-gray-900">{completedByName}</span>
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

      {/* Photo Viewer Dialog for Customer Report */}
      <Dialog open={photoViewerOpen} onOpenChange={setPhotoViewerOpen}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 bg-black">
          <div className="relative w-full h-full flex items-center justify-center min-h-[60vh]">
            {/* Close button */}
            <Button
              variant="ghost"
              size="sm"
              className="absolute top-4 right-4 z-10 bg-black/50 text-white hover:bg-black/70"
              onClick={() => setPhotoViewerOpen(false)}
            >
              <XCircle className="w-5 h-5" />
            </Button>

            {/* Previous button */}
            {selectedPhoto && selectedPhoto.total > 1 && selectedPhoto.index > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="absolute left-4 top-1/2 transform -translate-y-1/2 z-10 bg-black/50 text-white hover:bg-black/70"
                onClick={() => {
                  if (selectedPhoto && selectedBillPhotos.length > 0) {
                    const newIndex = selectedPhoto.index - 1;
                    setSelectedPhoto({
                      url: selectedBillPhotos[newIndex],
                      index: newIndex,
                      total: selectedBillPhotos.length
                    });
                  }
                }}
              >
                <ArrowRight className="w-5 h-5 rotate-180" />
              </Button>
            )}

            {/* Next button */}
            {selectedPhoto && selectedPhoto.total > 1 && selectedPhoto.index < selectedPhoto.total - 1 && (
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-4 top-1/2 transform -translate-y-1/2 z-10 bg-black/50 text-white hover:bg-black/70"
                onClick={() => {
                  if (selectedPhoto && selectedBillPhotos.length > 0) {
                    const newIndex = selectedPhoto.index + 1;
                    setSelectedPhoto({
                      url: selectedBillPhotos[newIndex],
                      index: newIndex,
                      total: selectedBillPhotos.length
                    });
                  }
                }}
              >
                <ArrowRight className="w-5 h-5" />
              </Button>
            )}

            {/* Photo counter */}
            {selectedPhoto && selectedPhoto.total > 1 && (
              <div className="absolute top-4 left-4 z-10 bg-black/50 text-white px-3 py-1 rounded-full text-sm">
                {selectedPhoto.index + 1} / {selectedPhoto.total}
              </div>
            )}

            {/* Main photo */}
            {selectedPhoto && (
              <img
                src={selectedPhoto.url}
                alt={`Photo ${selectedPhoto.index + 1}`}
                className="max-w-full max-h-[90vh] object-contain"
                onError={(e) => {
                  console.error('Image failed to load:', selectedPhoto.url);
                  e.currentTarget.style.display = 'none';
                }}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

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

      <Dialog open={technicianIdCardDialogOpen} onOpenChange={setTechnicianIdCardDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="w-5 h-5" />
              Technician ID Card QR Code
            </DialogTitle>
            <DialogDescription>
              Scan this QR code to view technician information
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center py-6">
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

              // Generate QR code URL for technician ID card
              const technicianIdCardUrl = `https://hydrogenro.com/technician-id/${technicianId}`;
              const qrCodeImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encodeURIComponent(technicianIdCardUrl)}`;

              return (
                <div className="flex flex-col items-center gap-4">
                  <div className="bg-white p-4 rounded-lg border-2 border-gray-200 shadow-lg">
                    <img
                      src={qrCodeImageUrl}
                      alt="Technician ID Card QR Code"
                      className="w-64 h-64 object-contain"
                      onError={(e) => {
                        console.error('QR code image failed to load:', qrCodeImageUrl);
                        e.currentTarget.style.display = 'none';
                        const parent = e.currentTarget.parentElement;
                        if (parent) {
                          parent.innerHTML = '<div class="text-center py-8 text-gray-600">QR code image not available</div>';
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
                  <div className="text-center">
                    <p className="text-xs text-gray-500 max-w-xs mb-2">
                      Scan this QR code to view technician information
                    </p>
                    <a
                      href={technicianIdCardUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:text-blue-800 underline break-all"
                    >
                      {technicianIdCardUrl}
                    </a>
                  </div>
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
                      <img src={qr.qrCodeUrl} alt={qr.name} className="h-32 w-32 object-contain" />
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
                      <img src={qr.qrCodeUrl} alt={qr.name} className="h-36 w-36 object-contain md:h-40 md:w-40" />
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
                    src={expandedCommonQr.qrCodeUrl}
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
    </div>
  );
};

export default TechnicianDashboard;
