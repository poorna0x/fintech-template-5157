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
  Star
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

// Bangalore areas list for location extraction
const bangaloreAreas = [
  'Bansawadi', 'Koramangala', 'Whitefield', 'Indiranagar', 'HSR', 'BTM', 'JP Nagar',
  'Malleshwaram', 'Rajajinagar', 'Vijayanagar', 'Basavanagudi', 'Banashankari', 'Jayanagar',
  'Yelahanka', 'Hebbal', 'RT Nagar', 'Vasanthnagar', 'Cunningham', 'Frazer Town', 'Marathahalli',
  'Bellandur', 'Electronic City', 'Bommanahalli', 'Bommasandra', 'Kadubeesanahalli', 'Mahadevapura',
  'KR Puram', 'HAL', 'Domlur', 'Ulsoor', 'Richmond', 'Shivajinagar', 'Cox Town', 'Cooke Town',
  'Austin Town', 'Richards Town', 'Murphy Town', 'Benson Town', 'HBR Layout', 'Kalyan Nagar',
  'Sahakara Nagar', 'Mathikere', 'Yeshwanthpur', 'Peenya', 'Chamrajpet', 'Chickpet', 'Gandhinagar',
  'Majestic', 'City Market', 'KR Market', 'Lalbagh', 'BTM Layout', 'Hosur Road', 'Bannerghatta',
  'Jigani', 'Anekal', 'Varthur', 'Sarjapur', 'Hoodi', 'Kundalahalli', 'Brookefield', 'Kaggadasapura',
  'Nagavara', 'Thanisandra', 'Hennur', 'Horamavu', 'Kothanur', 'Ramamurthy Nagar', 'Banaswadi',
  'CV Raman Nagar', 'Murugeshpalya', 'Adugodi', 'Wilson Garden', 'Richmond Town', 'Shanti Nagar',
  'Ashok Nagar', 'MG Road', 'Brigade Road', 'Commercial Street', 'Residency Road', 'Cubbon Park',
  'Vidhana Soudha', 'Cantonment', 'Bowring', 'Richmond Circle', 'Lavelle Road', 'St Marks Road',
  'Kasturba Road', 'Nrupathunga Road', 'Hudson Circle', 'Kempegowda', 'Majestic Bus Stand',
  'Sanjay Nagar', 'Gokula', 'Attiguppe', 'Vijaya Nagar', 'Nagarbhavi', 'Kengeri', 'Rajajinagar Extension',
  'Basaveshwara Nagar', 'Vijayanagar Extension', 'Yeshwanthpur Industrial', 'Nelamangala', 'Doddaballapur',
  'Devanahalli', 'Yelahanka New Town', 'Jakkur', 'Bagalur', 'Vidyaranyapura', 'MS Palya', 'Byatarayanapura',
  'BTM 2nd Stage', 'BTM 1st Stage', 'Uttarahalli', 'Girinagar',
  'JP Nagar 1st Phase', 'JP Nagar 2nd Phase', 'JP Nagar 3rd Phase', 'JP Nagar 4th Phase', 'JP Nagar 5th Phase',
  'JP Nagar 6th Phase', 'JP Nagar 7th Phase', 'JP Nagar 8th Phase', 'JP Nagar 9th Phase', 'Bannerghatta Road',
  'Arekere', 'Hulimavu', 'Begur', 'HSR Sector 1', 'HSR Sector 2', 'HSR Sector 3', 'HSR Sector 4',
  'HSR Sector 5', 'HSR Sector 6', 'HSR Sector 7', 'Arakere Mico Layout', 'Bommanahalli', 'Singasandra',
  'Hosa Road', 'Konanakunte', 'Doddakallasandra', 'Vijaya Bank Layout', 'Padmanabhanagar', 'Hosur',
  'Whitefield Main Road', 'ITPL', 'Kadugodi', 'Varthur Kodi', 'Panathur', 'Kundalahalli Gate',
  'AECS Layout', 'Doddanekundi', 'Marathahalli Bridge', 'Varthur Road', 'Whitefield Road', 'Hope Farm',
  'Budigere', 'Avalahalli', 'Bidrahalli', 'Kannamangala', 'Vaddarahalli', 'Chikkajala', 'Bagalur',
  'KR Puram Railway Station', 'Baiyappanahalli', 'Hennur Main Road', 'Kalyan Nagar Main Road',
  'Rajajinagar Industrial', 'Peenya Industrial', 'Jalahalli', 'Dasarahalli', 'Nagasandra', 'Tumkur Road',
  'Nelamangala Road', 'Magadi Road', 'Mysore Road', 'Kengeri Satellite Town', 'Rajarajeshwari Nagar',
  'Kumbalgodu', 'Anjanapura', 'Nayandahalli', 'Kengeri', 'Uttarahalli Hobli', 'Bidadi', 'Ramanagara',
  'MG Road', 'Brigade Road', 'Commercial Street', 'Residency Road', 'Cubbon Park', 'Vidhana Soudha',
  'Cantonment', 'Bowring', 'Richmond Circle', 'Lavelle Road', 'St Marks Road', 'Kasturba Road',
  'Nrupathunga Road', 'Hudson Circle', 'Kempegowda Bus Stand', 'Shivajinagar Bus Stand', 'Russell Market',
  'Church Street', 'Rest House Road', 'Cunningham Road', 'Miller Road', 'Palace Road',
  'Kempegowda', 'Majestic Bus Stand', 'City Railway Station',
  'Nelamangala', 'Doddaballapur', 'Devanahalli', 'Hoskote', 'Anekal', 'Jigani', 'Bidadi', 'Ramanagara', 'Ramanagaram',
  'Magadi', 'Tumkur', 'Tumkuru', 'Kolar', 'Kolar City', 'Chikkaballapur',
  'Adda', 'Kaknpura', 'Kakanpura', 'Kaknepura', 'Kaknepura Side', 'Kaknpura Side',
  'Ttible', 'Ttibble', 'Tibble', 'Tibble Side',
  'HBR Layout', 'HRBR Layout', 'KHB Layout', 'ARE Layout', 'BEML Layout', 'BEL Layout', 'ISRO Layout',
  'BDA Layout', 'BDA Complex', 'NRI Layout', 'Prestige Layout', 'Prestige Shantiniketan',
  'Agara', 'Akshayanagar', 'Amruthahalli', 'Anandnagar', 'Ananthapura', 'Anjanapura', 'Arakere',
  'Arekere', 'Avalahalli', 'Bagalur', 'Baiyappanahalli', 'Banaswadi', 'Bannerghatta', 'Basapura',
  'G.B palya', 'GB palya', 'GB Palya', 'Hongasandra', 'Mico Layout', 'Arakere Mico Layout',
  'HSR Layout', 'Somasandrapalya', 'ITI Layout',
  'Basavanagudi', 'Basaveshwara Nagar', 'Begur', 'Bellandur', 'BEML Layout', 'Benson Town',
  'Bhairava Nagar', 'Bidadi', 'Bidrahalli', 'Bommanahalli', 'Bommasandra', 'Brigade Road',
  'Brookefield', 'BTM', 'BTM Layout', 'Budigere', 'Byatarayanapura', 'Chamrajpet', 'Chickpet',
  'Chikkaballapur', 'Chikkajala', 'Church Street', 'City Market', 'Commercial Street', 'Cooke Town',
  'Cox Town', 'Cubbon Park', 'Cunningham', 'CV Raman Nagar', 'Dasarahalli', 'Devanahalli',
  'Doddaballapur', 'Doddakallasandra', 'Doddanekundi', 'Domlur', 'Electronic City', 'Frazer Town',
  'Gandhinagar', 'Girinagar', 'Gokula', 'HAL', 'Hebbal', 'Hennur', 'Hennur Main Road', 'Hoodi',
  'Hope Farm', 'Horamavu', 'Hosa Road', 'Hoskote', 'Hosur', 'Hosur Road', 'HSR', 'HSR Sector 1',
  'HSR Sector 2', 'HSR Sector 3', 'HSR Sector 4', 'HSR Sector 5', 'HSR Sector 6', 'HSR Sector 7',
  'Hudson Circle', 'Hulimavu', 'Indiranagar', 'ITPL', 'Jakkur', 'Jalahalli', 'Jayanagar', 'Jigani',
  'JP Nagar', 'JP Nagar 1st Phase', 'JP Nagar 2nd Phase', 'JP Nagar 3rd Phase', 'JP Nagar 4th Phase',
  'JP Nagar 5th Phase', 'JP Nagar 6th Phase', 'JP Nagar 7th Phase', 'JP Nagar 8th Phase', 'JP Nagar 9th Phase',
  'Kadubeesanahalli', 'Kadugodi', 'Kaggadasapura', 'Kalyan Nagar', 'Kalyan Nagar Main Road',
  'Kannamangala', 'Kasturba Road', 'Kempegowda', 'Kempegowda Bus Stand', 'Kengeri', 'Kengeri Satellite Town',
  'Konanakunte', 'Koramangala', 'Kothanur', 'KR Market', 'KR Puram', 'KR Puram Railway Station',
  'Kumbalgodu', 'Kundalahalli', 'Kundalahalli Gate', 'Lalbagh', 'Lavelle Road', 'Magadi', 'Magadi Road',
  'Mahadevapura', 'Majestic', 'Majestic Bus Stand', 'Marathahalli', 'Marathahalli Bridge', 'Mathikere',
  'MG Road', 'Miller Road', 'MS Palya', 'Murphy Town', 'Murugeshpalya', 'Mysore Road', 'Nagarbhavi',
  'Nagasandra', 'Nagavara', 'Nayandahalli', 'Nelamangala', 'Nelamangala Road', 'NRI Layout',
  'Nrupathunga Road', 'Padmanabhanagar', 'Palace Road', 'Panathur', 'Peenya', 'Peenya Industrial',
  'Prestige Layout', 'Prestige Shantiniketan', 'Rajarajeshwari Nagar', 'Rajajinagar', 'Rajajinagar Extension',
  'Rajajinagar Industrial', 'Ramamurthy Nagar', 'Ramanagara', 'Ramanagaram', 'Residency Road', 'Rest House Road',
  'Richmond', 'Richmond Circle', 'Richmond Town', 'RT Nagar', 'Russell Market', 'Sahakara Nagar',
  'Sanjay Nagar', 'Sarjapur', 'Shanti Nagar', 'Shivajinagar', 'Shivajinagar Bus Stand', 'Singasandra', 'Seshadripuram',
  'St Marks Road', 'Thanisandra', 'Tumkur', 'Tumkuru', 'Tumkur Road', 'Ulsoor', 'Uttarahalli', 'Uttarahalli Hobli',
  'Vaddarahalli', 'Varthur', 'Varthur Kodi', 'Varthur Road', 'Vasanthnagar', 'Vidhana Soudha',
  'Vidyaranyapura', 'Vijaya Bank Layout', 'Vijaya Nagar', 'Vijayanagar', 'Vijayanagar Extension',
  'Whitefield', 'Whitefield Main Road', 'Whitefield Road', 'Wilson Garden', 'Yelahanka', 'Yelahanka New Town',
  'Yeshwanthpur', 'Yeshwanthpur Industrial'
];

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
  const [completeJobStep, setCompleteJobStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);
  const [billAmount, setBillAmount] = useState<string>('');
  const [billPhotos, setBillPhotos] = useState<string[]>([]);
  const [paymentPhotos, setPaymentPhotos] = useState<string[]>([]);
  const [amcDateGiven, setAmcDateGiven] = useState<string>('');
  const [amcEndDate, setAmcEndDate] = useState<string>('');
  const [amcYears, setAmcYears] = useState<number>(0);
  const [amcIncludesPrefilter, setAmcIncludesPrefilter] = useState<boolean>(false);
  const [amcAdditionalInfo, setAmcAdditionalInfo] = useState<string>('');
  const [amcAmount, setAmcAmount] = useState<string>('');
  const [hasAMC, setHasAMC] = useState<boolean | null>(null);
  const [paymentMode, setPaymentMode] = useState<'CASH' | 'ONLINE' | ''>('');
  const [billAmountConfirmOpen, setBillAmountConfirmOpen] = useState(false);
  const [customerHasPrefilter, setCustomerHasPrefilter] = useState<boolean | null>(null);
  const [qrCodeType, setQrCodeType] = useState<string>('');
  const [selectedQrCodeId, setSelectedQrCodeId] = useState<string>('');
  const [commonQrCodes, setCommonQrCodes] = useState<CommonQrCode[]>([]);
  const [allCommonQrCodes, setAllCommonQrCodes] = useState<CommonQrCode[]>([]); // Store all QR codes
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [allTechnicians, setAllTechnicians] = useState<any[]>([]); // Store all technicians
  const [technicianVisibleQrCodes, setTechnicianVisibleQrCodes] = useState<string[]>([]); // Current technician's visibility settings
  const [paymentScreenshot, setPaymentScreenshot] = useState<string>('');
  const [isSubmittingJobCompletion, setIsSubmittingJobCompletion] = useState(false);

  // Phone popup state
  const [phonePopupOpen, setPhonePopupOpen] = useState(false);
  const [selectedCustomerPhone, setSelectedCustomerPhone] = useState<{phone: string, alternate_phone?: string, full_name?: string} | null>(null);

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
      const { data, error } = await db.jobs.getByTechnicianId(user.technicianId);
      console.timeEnd('loadAssignedJobs'); // Performance timing
      
      // Load AMC status for customers in these jobs
      if (data && data.length > 0) {
        const customerIds = data.map((job: any) => job.customer_id || (job.customer as any)?.id).filter(Boolean);
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
          setCustomerAMCStatus(amcStatusMap);
        }
      }
      
      if (error) {
        console.error('Error loading assigned jobs:', error);
        // Retry on network errors (up to 2 retries)
        if (retryCount < 2 && (error.message.includes('fetch') || error.message.includes('network') || error.message.includes('Failed to fetch'))) {
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
      
      setJobs(allJobs);
      hasJobsRef.current = true; // Mark that we've loaded jobs at least once
      
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
      // Only show error toast if it's a critical error, not transient network issues
      if (error instanceof Error && !error.message.includes('fetch') && !error.message.includes('network')) {
        toast.error('Failed to load assigned jobs');
      }
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
  }, [user?.technicianId, loadAssignedJobs]);

  // Always show AMC question first when entering step 3
  useEffect(() => {
    if (completeJobStep === 3) {
      setHasAMC(null);
    }
  }, [completeJobStep]);

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
        const [commonResult, allTechniciansResult] = await Promise.all([
          db.commonQrCodes.getAll(),
          db.technicians.getAll()
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

  // Set up realtime subscription for new job assignments
  useEffect(() => {
    if (!user?.technicianId) return;

    console.log('🔔 Setting up realtime subscription for technician:', user.technicianId);

    let channel: ReturnType<typeof supabase.channel>;
    let retryCount = 0;
    const maxRetries = 3;
    const retryDelay = 2000; // 2 seconds

    // Check if realtime is available by testing a simple subscription
    const checkRealtimeAvailable = async () => {
      try {
        // Try to create a test channel and see if it connects
        const testChannel = supabase.channel('realtime-test');
        let connectionTested = false;
        
        const testPromise = new Promise<boolean>((resolve) => {
          const timeout = setTimeout(() => {
            if (!connectionTested) {
              connectionTested = true;
              testChannel.unsubscribe();
              supabase.removeChannel(testChannel);
              resolve(false);
            }
          }, 3000); // 3 second timeout

          testChannel
            .subscribe((status) => {
              if (status === 'SUBSCRIBED' && !connectionTested) {
                connectionTested = true;
                clearTimeout(timeout);
                testChannel.unsubscribe();
                supabase.removeChannel(testChannel);
                resolve(true);
              } else if (status === 'CHANNEL_ERROR' && !connectionTested) {
                connectionTested = true;
                clearTimeout(timeout);
                testChannel.unsubscribe();
                supabase.removeChannel(testChannel);
                resolve(false);
              }
            });
        });

        const isAvailable = await testPromise;
        return isAvailable;
      } catch (error) {
        console.error('Error checking realtime availability:', error);
        return false;
      }
    };

    const setupSubscription = async () => {
      // Check if realtime is available first
      const realtimeAvailable = await checkRealtimeAvailable();
      
      if (!realtimeAvailable) {
        console.warn('⚠️ Realtime service appears to be unavailable. Using polling mode.');
        setRealtimeConnected(false);
        return; // Don't try to subscribe if realtime is not available
      }

      console.log('✅ Realtime service is available, setting up subscription...');
      // Remove existing channel if any
      if (channel) {
        try {
          supabase.removeChannel(channel);
        } catch (e) {
          console.warn('Error removing channel:', e);
        }
      }

      // Create a simpler channel without extra config
      channel = supabase
        .channel(`technician-jobs-${user.technicianId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'jobs',
            filter: `assigned_technician_id=eq.${user.technicianId}`,
          },
        async (payload) => {
          console.log('📨 Realtime update received:', payload);
          const updatedJob = payload.new as any;
          const oldJob = payload.old as any;
          
          // Skip if this job is already being processed (use ref for synchronous check)
          if (processingJobsRef.current.has(updatedJob.id)) {
            console.log('⚠️ Job already being processed, skipping duplicate realtime update:', updatedJob.id);
            return;
          }
          
          // Check if this is a NEW assignment (assigned_technician_id changed TO this technician)
          const wasAssignedToMe = oldJob?.assigned_technician_id === user.technicianId;
          const isNowAssignedToMe = updatedJob.assigned_technician_id === user.technicianId;
          const isNewAssignment = !wasAssignedToMe && isNowAssignedToMe;
          
          // Don't process if status is COMPLETED (already completed)
          const isCompleted = updatedJob.status === 'COMPLETED';
          
          console.log('🔍 Assignment check:', {
            wasAssignedToMe,
            isNowAssignedToMe,
            isNewAssignment,
            oldStatus: oldJob?.status,
            newStatus: updatedJob.status,
            isCompleted,
            oldAssignedId: oldJob?.assigned_technician_id,
            newAssignedId: updatedJob.assigned_technician_id,
            myTechnicianId: user.technicianId
          });
          
          // Check if this is a new assignment with ASSIGNED status
          // 1. It's newly assigned to this technician (wasn't before, is now)
          // 2. Status is ASSIGNED
          // 3. Not already being processed
          // 4. Not completed
          if (isNewAssignment && isNowAssignedToMe && updatedJob.status === 'ASSIGNED' && !isCompleted) {
            console.log('✅ New job assignment detected via realtime:', updatedJob.id);
            console.log('📋 Assignment details:', {
              wasAssignedToMe,
              isNowAssignedToMe,
              status: updatedJob.status,
              assignedDate: updatedJob.assigned_date
            });
            
            // Check assigned_date if it exists, otherwise accept it
            let shouldProcess = true;
            if (updatedJob.assigned_date) {
              const assignedDate = new Date(updatedJob.assigned_date);
              const now = new Date();
              const timeDiff = now.getTime() - assignedDate.getTime();
              
              // Only treat as new if assigned within last 10 minutes (more lenient)
              if (timeDiff < 10 * 60 * 1000 && timeDiff >= -60000) { // Allow 1 minute in future for clock skew
                shouldProcess = true;
              } else {
                console.log('⚠️ Job assignment too old or in future, ignoring:', timeDiff);
                shouldProcess = false;
              }
            }
            
            if (shouldProcess) {
              // Check if we're already processing this job (prevent duplicates) - use ref for synchronous check
              if (processingJobsRef.current.has(updatedJob.id)) {
                console.log('⚠️ Job already being processed, skipping duplicate:', updatedJob.id);
                return;
              }
              
              // Mark as processing immediately (synchronous)
              processingJobsRef.current.add(updatedJob.id);
              console.log('🔒 Marked job as processing:', updatedJob.id);
              
              // Remove from processing set after 30 seconds (in case of errors)
              setTimeout(() => {
                processingJobsRef.current.delete(updatedJob.id);
                console.log('🔓 Removed job from processing set:', updatedJob.id);
              }, 30000);
              
              // Fetch full job details with customer info
              try {
                const { data: fullJob, error } = await db.jobs.getById(updatedJob.id);
                if (!error && fullJob) {
                  // Add to jobs list (will show with blue border and NEW badge if not seen)
                  setJobs(prev => {
                    const exists = prev.some(j => j.id === fullJob.id);
                    if (exists) {
                      console.log('⚠️ Job already in list, updating:', fullJob.id);
                      return prev.map(j => j.id === fullJob.id ? fullJob : j);
                    }
                    console.log('✅ Adding new job to list:', fullJob.id);
                    return [fullJob, ...prev]; // Add to top
                  });
                  
                  // New job added silently - no notifications
                } else {
                  console.error('Error fetching job details:', error);
                }
              } catch (error) {
                console.error('Error fetching new job details:', error);
              }
            }
          } else {
            console.log('Not a new assignment:', { wasAssignedToMe, isNowAssignedToMe, status: updatedJob.status });
            
            // Even if not a new assignment, update the job in the UI if it's assigned to this technician
            if (isNowAssignedToMe && !processingJobsRef.current.has(updatedJob.id)) {
              console.log('🔄 Updating existing job in UI:', updatedJob.id);
              
              // Fetch full job details
              try {
                const { data: fullJob, error } = await db.jobs.getById(updatedJob.id);
                if (!error && fullJob) {
                  const jobStatus = (fullJob as any).status || fullJob.status;
                  
                  // Update in jobs list
                  setJobs(prev => {
                    const index = prev.findIndex(j => j.id === fullJob.id);
                    if (index >= 0) {
                      // Update existing job
                      const updated = [...prev];
                      updated[index] = fullJob;
                      return updated;
                    } else {
                      // Job not in list yet, add it if it's in an active status
                      if (['PENDING', 'ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS'].includes(jobStatus)) {
                        return [fullJob, ...prev];
                      }
                      return prev;
                    }
                  });
                  
                  console.log('✅ Job updated in UI');
                }
              } catch (error) {
                console.error('Error updating job in UI:', error);
              }
            }
          }
        }
      )
        .subscribe((status, err) => {
          if (err) {
            console.error('❌ Realtime subscription error:', err);
            console.error('Error details:', JSON.stringify(err, null, 2));
            console.error('Error type:', err?.constructor?.name);
            console.error('Error message:', err?.message);
            if (retryCount < maxRetries) {
              retryCount++;
              console.log(`🔄 Retrying realtime subscription (${retryCount}/${maxRetries})...`);
              setTimeout(() => {
                setupSubscription();
              }, retryDelay);
              } else {
                console.error('❌ Realtime failed after all retries. This might be a WebSocket connection issue.');
                console.error('💡 Possible causes:');
                console.error('   1. WebSocket connections blocked by firewall/network');
                console.error('   2. Supabase Realtime service might be down');
                console.error('   3. Check Supabase dashboard for Realtime service status');
                console.log('📡 Falling back to polling mode - checking for new jobs every 10 seconds');
                // Realtime unavailable - using polling silently
              }
          } else {
            console.log('✅ Realtime subscription status:', status);
            if (status === 'SUBSCRIBED') {
              console.log('🎉 Successfully subscribed to realtime updates for jobs');
                retryCount = 0; // Reset retry count on success
                setRealtimeConnected(true); // Mark realtime as connected
            } else if (status === 'CHANNEL_ERROR') {
              console.error('❌ Channel error - WebSocket connection failed');
              console.error('This usually means the WebSocket cannot connect to Supabase Realtime server');
              setRealtimeConnected(false); // Mark as not connected
              if (retryCount < maxRetries) {
                retryCount++;
                console.log(`🔄 Retrying realtime subscription (${retryCount}/${maxRetries})...`);
                setTimeout(() => {
                  setupSubscription();
                }, retryDelay);
              } else {
                console.error('💡 Realtime service is not available. Using polling mode instead.');
                console.error('💡 To enable realtime:');
                console.error('   1. Go to Supabase Dashboard → Settings → API');
                console.error('   2. Check if Realtime is enabled for your project');
                console.error('   3. Some projects require explicit Realtime enablement');
                setRealtimeConnected(false); // Ensure polling mode is active
                // Realtime unavailable - using polling silently
              }
            } else if (status === 'TIMED_OUT') {
              console.error('❌ Realtime subscription timed out');
              if (retryCount < maxRetries) {
                retryCount++;
                setTimeout(() => {
                  setupSubscription();
                }, retryDelay);
              } else {
                // Realtime connection timed out - using polling silently
              }
            } else if (status === 'CLOSED') {
              // CLOSED status is normal - happens during cleanup or when connection closes
              // Don't log as warning, just silently handle it
              // Don't retry on CLOSED - it's usually intentional cleanup
            } else {
              console.log('Realtime status:', status);
            }
          }
        });
    };

    // Initial setup
    setupSubscription();

    return () => {
      console.log('🧹 Cleaning up realtime subscription');
      if (channel) {
        supabase.removeChannel(channel);
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
      toast.error('Location tracking is disabled. Enable it in Settings to update your location.');
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

    // Check permission status
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
      // Permissions API not supported or failed
      console.log('Permissions API not available');
    }

    if (permissionStatus === 'denied') {
      console.error('Location permission denied');
      const errorMsg = 'Location permission denied. Click "Request Permission Again" to try again.';
      setLocationError(errorMsg);
      setLocationErrorType('permission');
      setLocationPermissionDenied(true);
      toast.error(errorMsg, { duration: 8000 });
      return;
    }

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
        enableHighAccuracy: true,
        timeout: 15000, // Increased timeout for better reliability
        maximumAge: 300000 // 5 minutes
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

  // Polling fallback for new jobs (when realtime fails)
  useEffect(() => {
    if (!user?.technicianId) return;
    
    // Only poll if realtime is not connected
    if (realtimeConnected) {
      console.log('✅ Realtime is connected, skipping polling');
      return;
    }

    console.log('📡 Realtime not connected, starting polling fallback (every 5 seconds)');
    
    // Poll every 5 seconds to check for new job assignments (faster when realtime is unavailable)
    const pollInterval = setInterval(() => {
      // Check for newly assigned jobs
      loadAssignedJobs();
    }, 5000); // Check every 5 seconds for faster detection

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
      // Filter completed jobs - only show today's completed jobs by this technician
      const today = new Date();
      const todayStart = new Date(today);
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(today);
      todayEnd.setHours(23, 59, 59, 999);
      
      filtered = filtered.filter(job => {
        const status = (job as any).status || job.status;
        if (status !== 'COMPLETED') return false;
        
        // Check if completed today
        const completedAt = (job as any).completed_at || job.completedAt;
        if (!completedAt) return false;
        
        const completedDate = new Date(completedAt);
        return completedDate >= todayStart && completedDate <= todayEnd;
      });
    } else if (statusFilter !== 'ALL') {
      filtered = filtered.filter(job => {
        const status = (job as any).status || job.status;
        return status === statusFilter;
      });
    }

    // Sort jobs: Follow-up jobs scheduled for today first, then NEW jobs, then IN_PROGRESS/EN_ROUTE, then others
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

    console.log(`🎯 Filtered jobs for display (filter: ${statusFilter}): ${filtered.length} jobs`, {
      totalJobs: jobs.length,
      filter: statusFilter,
      filteredCount: filtered.length
    });

    setFilteredJobs(filtered);
  }, [jobs, statusFilter, seenJobs]);

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
      // Only show error toast if it's a critical error, not transient network issues
      if (error instanceof Error && !error.message.includes('fetch') && !error.message.includes('network')) {
      toast.error('Failed to load assignment requests');
      }
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

      // Update local state
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

      // Update local state
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
      setQrCodeType('');
      setSelectedQrCodeId('');
    
    // Initialize customerHasPrefilter from customer's existing value if available
    const customerPrefilter = jobWithCustomer.customer 
      ? ((jobWithCustomer.customer as any).has_prefilter ?? (jobWithCustomer.customer as any).hasPrefilter ?? null)
      : null;
    setCustomerHasPrefilter(customerPrefilter);
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
      const { error: jobError } = await db.jobs.update(jobId, {
        status: 'FOLLOW_UP',
        follow_up_date: followUpData.followUpDate,
        follow_up_notes: followUpData.followUpReason || '',
        follow_up_scheduled_by: user?.id || 'technician',
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
        const { error: followUpError } = await supabase
          .from('follow_ups')
          .insert({
            job_id: jobId,
            scheduled_date: followUpData.followUpDate,
            reason: followUpData.followUpReason,
            parent_follow_up_id: followUpData.parentFollowUpId || null,
            scheduled_by: user?.id || 'technician',
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

  const handleCompleteJobSubmit = async () => {
    if (!selectedJobForComplete) return;

    // Step 1: Bill Amount - validate and show confirmation
    if (completeJobStep === 1) {
      if (!billAmount || parseFloat(billAmount) <= 0) {
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

    // Step 2: Bill Photo (optional) - move to step 3
    if (completeJobStep === 2) {
      // Save progress before moving to next step
      saveJobCompletionProgress(selectedJobForComplete.id, {
        billPhotos,
        billAmount,
        currentStep: 3,
      });
      setCompleteJobStep(3);
        return;
      }

    // Step 3: AMC Information (optional, can skip) - move to step 4
    if (completeJobStep === 3) {
      // Only allow proceeding if hasAMC is not null (question has been answered)
      if (hasAMC === null) {
        toast.error('Please answer whether the customer needs AMC or not');
        return;
      }
      
      // If years is 0, treat it as no AMC
      const effectiveHasAMC = hasAMC === true && amcYears > 0;
      
      // Save progress (AMC is optional, can skip)
      saveJobCompletionProgress(selectedJobForComplete.id, {
        billPhotos,
        billAmount,
        paymentMode: paymentMode as 'CASH' | 'ONLINE' | '',
        paymentScreenshot,
        qrCodeType,
        selectedQrCodeId,
        customerHasPrefilter,
        hasAMC: effectiveHasAMC,
        amcDateGiven: effectiveHasAMC ? amcDateGiven : '',
        amcEndDate: effectiveHasAMC ? amcEndDate : '',
        amcYears: effectiveHasAMC ? amcYears : 0,
        amcIncludesPrefilter: effectiveHasAMC ? amcIncludesPrefilter : false,
        amcAdditionalInfo: effectiveHasAMC ? amcAdditionalInfo : '',
        currentStep: 4,
      });
      setCompleteJobStep(4);
      return;
    }

    // Step 4: Payment Mode - validate and move to step 5
    if (completeJobStep === 4) {
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

    // Step 5: Payment Screenshot (optional) - move to step 6 (Prefilter)
    if (completeJobStep === 5) {
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
        currentStep: 6,
      });
      setCompleteJobStep(6);
      return;
    }

    // Step 6: Prefilter - submit the form
    if (completeJobStep === 6) {
      // Save progress before submitting
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
        customerHasPrefilter,
        currentStep: 6,
      });
      // Proceed to submit
    }
    setIsSubmittingJobCompletion(true);
    
    try {
      // STEP 1: Ensure all photos are uploaded to Cloudinary (must be URLs, not local files)
      const uploadedBillPhotos = billPhotos.filter(url => 
        url && typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'))
      );
      
      // Check if there are any non-uploaded photos
      const nonUploadedPhotos = billPhotos.filter(url => 
        url && typeof url === 'string' && !url.startsWith('http://') && !url.startsWith('https://')
      );
      
      if (nonUploadedPhotos.length > 0) {
        toast.error(`Please wait for ${nonUploadedPhotos.length} photo(s) to finish uploading before completing the job.`);
        setIsSubmittingJobCompletion(false);
        return;
      }
      
      // Check payment screenshot if ONLINE payment
      if (paymentMode === 'ONLINE' && paymentScreenshot && !paymentScreenshot.startsWith('http://') && !paymentScreenshot.startsWith('https://')) {
        toast.error('Please wait for payment screenshot to finish uploading before completing the job.');
        setIsSubmittingJobCompletion(false);
        return;
      }

      // STEP 2: Get QR code details
      let selectedQrCodeUrl: string | undefined;
      let selectedQrCodeName: string | undefined;
      
      if (selectedQrCodeId && selectedQrCodeId.startsWith('common_')) {
        const qrId = selectedQrCodeId.replace('common_', '');
        const selectedQr = commonQrCodes.find(qr => qr.id === qrId);
        if (selectedQr) {
          selectedQrCodeUrl = selectedQr.qrCodeUrl;
          selectedQrCodeName = selectedQr.name;
        }
      } else if (selectedQrCodeId && selectedQrCodeId.startsWith('technician_')) {
        const techId = selectedQrCodeId.replace('technician_', '');
        const selectedTech = technicians.find(t => t.id === techId);
        if (selectedTech && selectedTech.qrCode) {
          selectedQrCodeUrl = selectedTech.qrCode;
          selectedQrCodeName = selectedTech.fullName || 'Technician';
        }
      }

      // STEP 3: Submit directly to database
      try {
        // Prepare update data
        let dbPaymentMethod: 'CASH' | 'CARD' | 'UPI' | 'BANK_TRANSFER' | null = null;
        if (paymentMode === 'CASH') {
          dbPaymentMethod = 'CASH';
        } else if (paymentMode === 'ONLINE') {
          dbPaymentMethod = 'UPI';
        }
        
        const updateData: any = {
          status: 'COMPLETED',
          end_time: new Date().toISOString(),
          completion_notes: completionNotes.trim(),
          completed_by: user?.id || user?.technicianId || null,
          completed_at: new Date().toISOString(),
          actual_cost: parseFloat(billAmount) || 0,
          payment_amount: parseFloat(billAmount) || 0,
          payment_method: dbPaymentMethod || 'CASH',
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

        // Remove existing photo-related requirements to avoid duplicates
        requirements = requirements.filter((req: any) => !req.bill_photos && !req.payment_photos && !req.qr_photos);

        // Add bill photos (all should be uploaded Cloudinary URLs at this point)
        if (uploadedBillPhotos.length > 0) {
          requirements.push({ bill_photos: uploadedBillPhotos });
          console.log('✅ Added bill photos to requirements:', uploadedBillPhotos);
        }

        if (paymentMode === 'ONLINE') {
          const qrPhotos: any = {
            qr_code_type: qrCodeType,
            selected_qr_code_id: selectedQrCodeId,
            payment_screenshot: paymentScreenshot && paymentScreenshot.startsWith('http') ? paymentScreenshot : null,
            selected_qr_code_url: selectedQrCodeUrl,
            selected_qr_code_name: selectedQrCodeName,
          };
          requirements.push({ qr_photos: qrPhotos });
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
        if (uploadedBillPhotos.length > 0) {
          toast.success(`Job completed successfully with ${uploadedBillPhotos.length} photo(s)!`, {
            duration: 3000,
          });
        } else {
          toast.success('Job completed successfully!', {
            duration: 3000,
          });
        }

        // Update customer prefilter status if provided
        if (customerHasPrefilter !== null && selectedJobForComplete.customer) {
          const customerId = (selectedJobForComplete.customer as any).id || selectedJobForComplete.customer.id;
          if (customerId) {
            try {
              await db.customers.update(customerId, {
                has_prefilter: customerHasPrefilter
              });
            } catch (error) {
              console.warn('Failed to update customer prefilter status:', error);
            }
          }
        }

        // Update local state
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
        setCustomerHasPrefilter(null);
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
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const whatsappUrl = `https://wa.me/${cleanPhone}`;
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
      
      const photoSet = new Set<string>(); // Use Set to avoid duplicates
      
      if (customerJobs && Array.isArray(customerJobs)) {
        customerJobs.forEach((job: any) => {
          // Get photos from before_photos field
          const jobBeforePhotos = Array.isArray(job.before_photos || job.beforePhotos) 
            ? (job.before_photos || job.beforePhotos) 
            : [];
          const extractedBeforePhotos = extractPhotoUrls(jobBeforePhotos);
          extractedBeforePhotos.forEach(url => photoSet.add(url));
          
          // Get photos from after_photos field
          const jobAfterPhotos = Array.isArray(job.after_photos || job.afterPhotos) 
            ? (job.after_photos || job.afterPhotos) 
            : [];
          const extractedAfterPhotos = extractPhotoUrls(jobAfterPhotos);
          extractedAfterPhotos.forEach(url => photoSet.add(url));
          
          // Also check if there are photos in the images field
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
  const todayStart = new Date(today);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(today);
  todayEnd.setHours(23, 59, 59, 999);
  const completedCount = jobs.filter(job => {
    if (job.status !== 'COMPLETED') return false;
    const completedAt = (job as any).completed_at || job.completedAt;
    if (!completedAt) return false;
    const completedDate = new Date(completedAt);
    return completedDate >= todayStart && completedDate <= todayEnd;
  }).length;

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
                    loadAssignedJobs();
                    loadAssignmentRequests();
                    toast.success('Refreshing jobs...');
                  }}
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Refresh
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
            <p className="text-xs text-gray-500 mb-3">
              {statusFilter === 'ONGOING' 
                ? `Showing ${filteredJobs.length} ongoing jobs (pending, assigned, in-progress)`
                : statusFilter === 'RESCHEDULED'
                ? `Showing ${filteredJobs.length} follow-up jobs`
                : statusFilter === 'CANCELLED'
                ? `Showing ${filteredJobs.length} denied jobs (today only)`
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
                    ? 'You have no completed jobs.'
                    : 'You have no jobs at the moment.'}
                </p>
              </CardContent>
            </Card>
          ) : (
            filteredJobs.map((job) => {
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
                <div key={job.id}>
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
            })
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
                  ₹{parseFloat(billAmount || '0').toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                    {completeJobStep === 6 && 'Does the customer have a prefilter?'}
                  </>
                )}
              </DialogDescription>
            </DialogHeader>
            
            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
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
                        Bill Amount: ₹{parseFloat(billAmount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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

              {/* Step 3: AMC Information (Optional - Can Skip) */}
              {completeJobStep === 3 && (
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

              {/* Step 4: Payment Mode */}
              {completeJobStep === 4 && (
                <div className="space-y-4">
                  <div>
                      <Label htmlFor="payment-mode">Payment Mode *</Label>
                      <Select 
                        value={paymentMode} 
                        onValueChange={(value: 'CASH' | 'ONLINE') => {
                          setPaymentMode(value);
                          // Reset QR code fields when changing payment mode
                          if (value === 'CASH') {
                          setQrCodeType('');
                          setSelectedQrCodeId('');
                          setPaymentScreenshot('');
                          }
                        }}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Select payment mode" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="CASH">Cash</SelectItem>
                          <SelectItem value="ONLINE">Online</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  
                  {paymentMode === 'ONLINE' && (
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
                  </div>
                )}
                      </div>
                    )}

              {/* Step 5: Payment Screenshot (optional) */}
              {completeJobStep === 5 && (
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

              {/* Step 6: Prefilter Question */}
              {completeJobStep === 6 && (
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
                </div>
              )}

            </div>

            <DialogFooter className="px-6 py-4 flex-shrink-0 border-t">
              <Button
                variant="outline"
                onClick={() => {
                  if (completeJobStep > 1) {
                    setCompleteJobStep((prev) => (prev - 1) as 1 | 2 | 3 | 4 | 5 | 6);
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
      setQrCodeType('');
      setSelectedQrCodeId('');
      setPaymentScreenshot('');
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
              {completeJobStep === 3 && (
                <Button
                  variant="outline"
                  onClick={() => {
                    // Skip AMC step - move to payment mode
                    saveJobCompletionProgress(selectedJobForComplete.id, {
                      billPhotos,
                      billAmount,
                      paymentMode: paymentMode as 'CASH' | 'ONLINE' | '',
                      qrCodeType,
                      selectedQrCodeId,
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
                  (completeJobStep === 4 && !paymentMode) || 
                  (completeJobStep === 4 && paymentMode === 'ONLINE' && !selectedQrCodeId)
                }
              >
                {isSubmittingJobCompletion ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    {completeJobStep === 6 ? 'Submitting...' : 'Saving...'}
                  </>
                ) : (
                  completeJobStep === 6 ? 'Complete Job' : 'Next'
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
                onClick={() => setStatusFilter('COMPLETED')}
                className={`flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-lg transition-all duration-200 ${
                  statusFilter === 'COMPLETED'
                    ? 'bg-green-600 text-white shadow-md'
                    : 'bg-gray-50 text-gray-400 opacity-60 hover:opacity-80'
                }`}
              >
                <CheckCircle className={`h-5 w-5 ${statusFilter === 'COMPLETED' ? 'text-white' : 'text-green-400'}`} />
                <span className="text-xs font-medium">Completed</span>
                <span className={`text-xs font-bold ${statusFilter === 'COMPLETED' ? 'text-green-100' : 'text-gray-400'}`}>
                  {completedCount}
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
                  
                  // Display AMC cost - prioritize from additional_info, fallback to amcInfo.amount
                  const displayCost = amcCost || totalAmount || amcInfo.amount;
                  
                  return (
                    <>
                      {displayCost && (
                        <div className="text-sm">
                          <span className="text-gray-600 font-medium">AMC Cost:</span>
                          <p className="text-gray-900 font-semibold mt-1">
                            ₹{parseFloat(displayCost.toString()).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
            const completedJobs = customerReportJobs.filter(job => {
              const jobStatus = (job as any).status || job.status;
              return jobStatus === 'COMPLETED';
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
                            // Try to find technician by ID from allTechnicians
                            const completedByTechnician = allTechnicians.find(tech => tech.id === completedBy);
                            completedByName = completedByTechnician?.fullName || 'Technician';
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
                        const billPhotos = requirements.find((r: any) => r?.bill_photos)?.bill_photos || [];
                        const paymentScreenshot = qrPhotos?.payment_screenshot || null;
                        
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
                              
                              {/* Payment Mode */}
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
                                
                                // Don't show lead source if it's "Website" (same as admin dashboard)
                                if (leadSource && leadSource !== 'Website') {
                                  return (
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm font-medium text-gray-700 w-32">Lead Source:</span>
                                      <span className="text-sm text-gray-900">{leadSource}</span>
                                    </div>
                                  );
                                }
                                return null;
                              })()}
                              
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
    </div>
  );
};

export default TechnicianDashboard;
