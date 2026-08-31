import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Customer } from '@/types';
import { db } from '@/lib/supabase';
import { toast } from 'sonner';
import { TOAST_VALIDATION } from '@/lib/toastOptions';
import { MapPin, Download, ExternalLink, Loader2, ChevronDown, X, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { generateJobNumber, extractLocationFromAddressString, bangaloreAreas, formatCustomTimeLabel, getDefaultLeadCost, resolveVisibleAddressFromGeocode, reverseGeocodeLatLng, nextVisibleAddressFromMapsFetch, VISIBLE_ADDRESS_MAX_LEN } from '@/lib/adminUtils';
import {
  isLeadSourceAllowCustomText,
  isLeadSourceRequiresOtp,
  isServiceSubTypeAllowCustomText,
  leadSourceValueForSave,
} from '@/lib/leadCatalog';
import { LeadSourceSelect } from '@/components/admin/LeadSourceSelect';
import { ServiceSubTypeSelect } from '@/components/admin/ServiceSubTypeSelect';
import { isJobCreateFormComplete } from '@/lib/jobCreateRequired';
import ImageUpload from '@/components/ImageUpload';
import { CustomAppointmentTimeSelect } from '@/components/admin/CustomAppointmentTimeSelect';
import { FollowUpCreateSection } from '@/components/admin/FollowUpCreateSection';
import type { FollowUpScheduleValue } from '@/components/admin/FollowUpScheduleFields';
import PhoneSwapButton from '@/components/admin/PhoneSwapButton';
import { resolveSupabaseAccessTokenForApi } from '@/lib/ensureSupabaseSession';
import {
  extractCoordinatesFromGoogleMapsLink,
  extractMapsUrlFromText,
  isGoogleMapsShortLink,
  isGoogleMapsUrl,
  resolveGoogleMapsInputToCoords,
  sanitizeGoogleMapsInput,
} from '@/lib/googleMapsLink';
import { removePlusCode } from '@/lib/maps';
import { beginWebClipboardRead, readClipboardText } from '@/lib/nativeClipboard';
import {
  EQUIPMENT_BRAND_DATA as brandData,
  EQUIPMENT_MODEL_DATA as modelData,
} from '@/lib/equipment-suggestions';
import { getDefaultNewJobScheduledDate, getIstCalendarDate } from '@/lib/adminDashboardDateHelpers';
import { nextPresetAppointmentTime } from '@/lib/adminAppointmentTimes';
import { scheduleRootFollowUpOnJob } from '@/lib/adminFollowUpSubmit';
import { deriveScheduleFromFollowUpTime } from '@/lib/followUpToOngoing';

const EMPTY_PHOTO_LIST: string[] = [];

export interface JobAssignedToTechnicianPayload {
  technicianId: string;
  serviceSubType: string;
  customerName: string;
  visibleAddress?: string;
  address?: { area?: string; city?: string };
  leadSource?: string;
  customTime?: string;
  description?: string;
  agreedCost?: string;
}

// Keep unsaved Add Customer input in localStorage so closing the dialog (or a refresh)
// doesn't lose what was typed. Cleared once the customer is created.
const ADD_CUSTOMER_DRAFT_KEY = 'add_customer_draft_v1';

const createDefaultAddFormData = () => ({
  full_name: '',
  phone: '',
  alternate_phone: '',
  email: '',
  service_types: [] as string[],
  equipment: {} as { [serviceType: string]: { brand: string; model: string } },
  photos: {} as { [serviceType: string]: string[] },
  behavior: '',
  native_language: '',
  status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE' | 'BLOCKED',
  notes: '',
  address: '',
  visible_address: '',
  google_location: '',
  service_cost: 0,
  cost_agreed: false,
});

const createDefaultStep5JobData = () => ({
  service_type: 'RO' as 'RO' | 'SOFTENER',
  service_sub_type: 'Service',
  service_sub_type_custom: '',
  scheduled_date: '',
  scheduled_time_slot: 'MORNING' as 'MORNING' | 'AFTERNOON' | 'EVENING' | 'FLEXIBLE' | 'CUSTOM',
  scheduled_time_custom: '',
  description: '',
  lead_source: '',
  lead_source_custom: '',
  lead_cost: '',
  cost_agreed: '',
  priority: 'MEDIUM' as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT',
  assigned_technician_id: '',
  require_otp: false,
});

const loadAddCustomerDraft = (): {
  addFormData?: Partial<ReturnType<typeof createDefaultAddFormData>>;
  step5JobData?: Partial<ReturnType<typeof createDefaultStep5JobData>>;
  currentStep?: number;
  shouldCreateJob?: boolean;
} | null => {
  try {
    const raw = localStorage.getItem(ADD_CUSTOMER_DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const clearAddCustomerDraft = () => {
  try {
    localStorage.removeItem(ADD_CUSTOMER_DRAFT_KEY);
  } catch {
    /* ignore */
  }
};

// Whether a saved draft holds enough typed info to be worth resuming.
const draftHasData = (draft: ReturnType<typeof loadAddCustomerDraft>): boolean => {
  const f = draft?.addFormData;
  if (!f) return false;
  return Boolean(
    f.full_name ||
      f.phone ||
      f.alternate_phone ||
      f.email ||
      f.address ||
      f.visible_address ||
      f.notes ||
      (Array.isArray(f.service_types) && f.service_types.length > 0)
  );
};

const ADD_CUSTOMER_STEPS = ['Personal', 'Address', 'Services', 'Review', 'Job'] as const;

interface AddCustomerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customers: Customer[];
  /** Called after customer (and optional job) created. Pass the created customer so the parent can append to list (e.g. when no job created). */
  onCustomerCreated: (newCustomer?: any) => Promise<void>;
  onExistingCustomerFound?: (customer: Customer) => void;
  /** When provided, runs once when user clicks Next from step 1; only proceed if no duplicate. Not called on blur. */
  onCheckExistingCustomer?: (phone: string, email?: string) => Promise<Customer | null>;
  /** When a new job is created with a technician assigned (step 5), open WhatsApp notify flow in parent. */
  onJobAssignedToTechnician?: (payload: JobAssignedToTechnicianPayload) => void;
}

const AddCustomerDialog: React.FC<AddCustomerDialogProps> = ({
  open,
  onOpenChange,
  customers,
  onCustomerCreated,
  onExistingCustomerFound,
  onCheckExistingCustomer,
  onJobAssignedToTechnician,
}) => {
  const initialDraftRef = useRef(loadAddCustomerDraft());
  const [currentStep, setCurrentStep] = useState(() =>
    typeof initialDraftRef.current?.currentStep === 'number' ? initialDraftRef.current.currentStep : 1
  );
  const [formErrors, setFormErrors] = useState<{[key: string]: string}>({});
  const [isCreating, setIsCreating] = useState(false);
  const [shouldCreateJob, setShouldCreateJob] = useState(
    typeof initialDraftRef.current?.shouldCreateJob === 'boolean'
      ? initialDraftRef.current.shouldCreateJob
      : true
  ); // Default to true
  const [scheduleAsFollowUp, setScheduleAsFollowUp] = useState(false);
  const [followUpSchedule, setFollowUpSchedule] = useState<FollowUpScheduleValue>({
    followUpDate: getIstCalendarDate(),
    followUpTime: nextPresetAppointmentTime(),
    followUpReason: '',
    autoMoveToOngoingOnDate: false,
    addAmcReminder: false,
  });
  const [addFormData, setAddFormData] = useState(() => ({
    ...createDefaultAddFormData(),
    ...(initialDraftRef.current?.addFormData || {}),
  }));
  const [visibleAddressSuggestions, setVisibleAddressSuggestions] = useState(false);
  const [brandSuggestions, setBrandSuggestions] = useState<string[]>([]);
  const [modelSuggestions, setModelSuggestions] = useState<string[]>([]);
  const [showBrandSuggestions, setShowBrandSuggestions] = useState(false);
  const [showModelSuggestions, setShowModelSuggestions] = useState(false);
  const [duplicateFoundOnBlur, setDuplicateFoundOnBlur] = useState<Customer | null>(null);
  // When the dialog opens with a saved (uncreated) draft, ask whether to resume or start fresh.
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const wasOpenRef = useRef(false);
  const locationManuallyEditedRef = useRef(false);
  // Mirrors addFormData.google_location for race-safe reads across async awaits
  // (e.g. while clipboard.readText is in flight, the user might start typing).
  const googleLocationRef = useRef('');
  // Coords from Fetch Address — used at save when the Maps URL has no lat/lng in the string.
  // Must be cleared whenever the Maps link changes or the form resets; otherwise the next
  // customer can inherit the previous customer's pin (admin link correct, tech/distance wrong).
  const fetchedCoordsRef = useRef<{ latitude: number; longitude: number } | null>(null);
  // Full Maps share text (place name + link) from clipboard — used when short-link expand fails.
  const mapsShareTextRef = useRef('');

  const clearLocationFetchState = useCallback(() => {
    fetchedCoordsRef.current = null;
    mapsShareTextRef.current = '';
  }, []);
  // Guards against double-clicks and other re-entrancy on the Fetch Address button.
  const [isFetchingAddress, setIsFetchingAddress] = useState(false);
  const [step5JobData, setStep5JobData] = useState(() => ({
    ...createDefaultStep5JobData(),
    ...(initialDraftRef.current?.step5JobData || {}),
  }));

  // Load technicians for assignment
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [loadingTechnicians, setLoadingTechnicians] = useState(false);
  const [leadCostExpanded, setLeadCostExpanded] = useState(false);
  const equipmentUploadingRef = useRef<Record<string, boolean>>({});
  const [anyEquipmentUploading, setAnyEquipmentUploading] = useState(false);
  const [isWaitingForPhotos, setIsWaitingForPhotos] = useState(false);
  const addFormDataRef = useRef(addFormData);
  addFormDataRef.current = addFormData;
  const fullNameInputRef = useRef<HTMLInputElement>(null);

  const focusStepOneName = useCallback(() => {
    requestAnimationFrame(() => {
      fullNameInputRef.current?.focus({ preventScroll: true });
    });
  }, []);

  const handleEquipmentUploadState = useCallback((serviceType: string, uploading: boolean) => {
    equipmentUploadingRef.current[serviceType] = uploading;
    setAnyEquipmentUploading(Object.values(equipmentUploadingRef.current).some(Boolean));
  }, []);

  const waitForEquipmentUploads = useCallback((timeoutMs = 120_000) => {
    return new Promise<boolean>((resolve) => {
      const start = Date.now();
      const tick = () => {
        if (!Object.values(equipmentUploadingRef.current).some(Boolean)) {
          resolve(true);
          return;
        }
        if (Date.now() - start >= timeoutMs) {
          resolve(false);
          return;
        }
        setTimeout(tick, 250);
      };
      tick();
    });
  }, []);

  useEffect(() => {
    if (open) setDuplicateFoundOnBlur(null);
    if (!open) {
      setLeadCostExpanded(false);
      equipmentUploadingRef.current = {};
      setAnyEquipmentUploading(false);
      // Closing must drop Fetch coords — dialog stays mounted while closed.
      clearLocationFetchState();
    }
  }, [open, clearLocationFetchState]);

  useEffect(() => {
    if (!open || currentStep !== 1 || showResumePrompt) return;
    const timer = window.setTimeout(focusStepOneName, 150);
    return () => window.clearTimeout(timer);
  }, [open, currentStep, showResumePrompt, focusStepOneName]);

  // On open, if there's an uncreated draft, ask the admin to resume or start new.
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setShowResumePrompt(draftHasData(loadAddCustomerDraft()));
    }
    if (!open) {
      setShowResumePrompt(false);
    }
    wasOpenRef.current = open;
  }, [open]);

  // Persist in-progress input so closing the dialog (or a refresh) doesn't lose it.
  // Only while open, so the post-submit reset doesn't re-write an empty draft.
  useEffect(() => {
    if (!open) return;
    try {
      localStorage.setItem(
        ADD_CUSTOMER_DRAFT_KEY,
        JSON.stringify({ addFormData, step5JobData, currentStep, shouldCreateJob })
      );
    } catch {
      /* ignore quota/serialization errors */
    }
  }, [open, addFormData, step5JobData, currentStep, shouldCreateJob]);

  // Keep ref synced with the latest google_location so async handlers can read
  // the current value without re-running themselves on every keystroke.
  useEffect(() => {
    googleLocationRef.current = addFormData.google_location || '';
  }, [addFormData.google_location]);

  useEffect(() => {
    const loadTechnicians = async () => {
      if (open && shouldCreateJob) {
        setLoadingTechnicians(true);
        try {
          // OPTIMIZATION: Limit technicians fetch
          const { data, error } = await db.technicians.getList(100);
          if (error) {
            console.error('Error loading technicians:', error);
          } else {
            setTechnicians(data || []);
          }
        } catch (error) {
          console.error('Error loading technicians:', error);
        } finally {
          setLoadingTechnicians(false);
        }
      }
    };
    loadTechnicians();
  }, [open, shouldCreateJob]);

  // Initialize scheduled_date when dialog opens and shouldCreateJob is true
  useEffect(() => {
    if (open && shouldCreateJob && !step5JobData.scheduled_date) {
      setStep5JobData(prev => ({
        ...prev,
        scheduled_date: getDefaultNewJobScheduledDate(),
        service_type: addFormData.service_types[0] === 'SOFTENER' ? 'SOFTENER' : 'RO'
      }));
    }
  }, [open, shouldCreateJob, step5JobData.scheduled_date, addFormData.service_types]);

  const handleResumeDraft = () => {
    const draft = loadAddCustomerDraft();
    // Never keep Fetch coords from a previous create — resume only restores form fields.
    clearLocationFetchState();
    if (draft) {
      const resumed = { ...createDefaultAddFormData(), ...(draft.addFormData || {}) };
      setAddFormData(resumed);
      setStep5JobData({ ...createDefaultStep5JobData(), ...(draft.step5JobData || {}) });
      if (typeof draft.currentStep === 'number') setCurrentStep(draft.currentStep);
      if (typeof draft.shouldCreateJob === 'boolean') setShouldCreateJob(draft.shouldCreateJob);
      // If draft Maps URL already embeds coords, restore them so save doesn't need re-Fetch.
      const draftLink = String(resumed.google_location || '').trim();
      if (draftLink) {
        const fromUrl = extractCoordinatesFromGoogleMapsLink(draftLink);
        if (fromUrl) fetchedCoordsRef.current = fromUrl;
      }
    }
    setShowResumePrompt(false);
  };

  const handleStartNewEntry = () => {
    clearAddCustomerDraft();
    clearLocationFetchState();
    setAddFormData(createDefaultAddFormData());
    setStep5JobData(createDefaultStep5JobData());
    setCurrentStep(1);
    setFormErrors({});
    setDuplicateFoundOnBlur(null);
    setShouldCreateJob(true);
    setShowResumePrompt(false);
  };

  const cleanPhoneNumber = (phone: string): string => {
    return phone.replace(/\D/g, '');
  };

  const formatPhoneNumber = (phone: string): string => {
    const cleaned = cleanPhoneNumber(phone);
    
    if (cleaned.startsWith('91') && cleaned.length === 12) {
      return cleaned.substring(2);
    }
    
    if (cleaned.startsWith('0') && cleaned.length === 11) {
      return cleaned.substring(1);
    }
    
    return cleaned;
  };

  const validatePhoneNumber = (phone: string): { isValid: boolean; error?: string; formatted?: string } => {
    const cleaned = cleanPhoneNumber(phone);
    
    if (!cleaned) {
      return { isValid: true };
    }
    
    if (cleaned.length !== 10) {
      return { 
        isValid: false, 
        error: 'Phone number must be exactly 10 digits (e.g., 6361631253)' 
      };
    }
    
    if (!/^[6-9]/.test(cleaned)) {
      return { 
        isValid: false, 
        error: 'Phone number must start with 6, 7, 8, or 9' 
      };
    }
    
    return { isValid: true, formatted: cleaned };
  };

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

  const validateStep = (step: number): boolean => {
    const errors: {[key: string]: string} = {};
    
    switch (step) {
      case 1:
        // Phone number is required
        if (!addFormData.phone || !addFormData.phone.trim()) {
          errors.phone = 'Phone number is required';
        } else {
          const phoneValidation = validatePhoneNumber(addFormData.phone);
          if (!phoneValidation.isValid) {
            errors.phone = phoneValidation.error || 'Invalid phone number';
          }
        }
        
        // Alternate phone is optional but must be valid if provided
        if (addFormData.alternate_phone && addFormData.alternate_phone.trim()) {
          const alternatePhoneValidation = validatePhoneNumber(addFormData.alternate_phone);
          if (!alternatePhoneValidation.isValid) {
            errors.alternate_phone = alternatePhoneValidation.error || 'Invalid alternate phone number';
          }
        }
        
        if (addFormData.email && addFormData.email.trim()) {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(addFormData.email)) {
            errors.email = 'Please enter a valid email address';
          }
        }
        break;
      case 2:
        break;
      case 3:
        break;
      case 4:
        break;
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const nextStep = async () => {
    if (!validateStep(currentStep)) return;
    if (currentStep === 1) {
      if (onCheckExistingCustomer) {
        const existing = await onCheckExistingCustomer(addFormData.phone, addFormData.email);
        if (existing) {
          setDuplicateFoundOnBlur(existing);
          onExistingCustomerFound?.(existing);
          return;
        }
        setDuplicateFoundOnBlur(null);
      } else {
        const existing = checkExistingCustomer(addFormData.phone, addFormData.email);
        if (existing && onExistingCustomerFound) {
          setDuplicateFoundOnBlur(existing);
          onExistingCustomerFound(existing);
          return;
        }
        setDuplicateFoundOnBlur(null);
      }
    }
    setCurrentStep(prev => Math.min(prev + 1, 5));
  };

  const prevStep = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  const capitalizeFirstLetter = (value: string): string => {
    return value.replace(/^(\s*)([a-z])/, (_, leadingSpaces: string, letter: string) => {
      return `${leadingSpaces}${letter.toUpperCase()}`;
    });
  };

  const shouldCapitalizeAddFormField = (field: string): boolean => {
    return ['full_name', 'address', 'visible_address', 'behavior', 'notes'].includes(field);
  };

  const handleAddFormChange = (field: string, value: string | string[]) => {
    const nextValue =
      typeof value === 'string' && shouldCapitalizeAddFormField(field)
        ? capitalizeFirstLetter(value)
        : value;

    setAddFormData(prev => ({
      ...prev,
      [field]: nextValue
    }));

    if (field === 'google_location') {
      const text = typeof nextValue === 'string' ? nextValue : '';
      googleLocationRef.current = text;
      // Any link change invalidates the previous Fetch — otherwise a prior customer's
      // lat/lng can be saved onto this customer while the pasted link looks correct.
      fetchedCoordsRef.current = null;
      mapsShareTextRef.current = text.trim() ? text : '';
    }

    if (formErrors[field]) {
      setFormErrors(prev => ({
        ...prev,
        [field]: ''
      }));
    }
  };

  const handlePhoneChange = (value: string) => {
    const cleaned = value.replace(/\D/g, '');
    
    let processed = cleaned;
    if (processed.startsWith('91') && processed.length > 10) {
      processed = processed.substring(2);
    }
    if (processed.startsWith('0') && processed.length > 10) {
      processed = processed.substring(1);
    }
    
    const limited = processed.substring(0, 10);
    
    setAddFormData(prev => ({
      ...prev,
      phone: limited
    }));

    if (formErrors.phone) {
      setFormErrors(prev => ({
        ...prev,
        phone: ''
      }));
    }
  };

  const handleAlternatePhoneChange = (value: string) => {
    const cleaned = value.replace(/\D/g, '');
    
    let processed = cleaned;
    if (processed.startsWith('91') && processed.length > 10) {
      processed = processed.substring(2);
    }
    if (processed.startsWith('0') && processed.length > 10) {
      processed = processed.substring(1);
    }
    
    const limited = processed.substring(0, 10);
    
    setAddFormData(prev => ({
      ...prev,
      alternate_phone: limited
    }));

    if (formErrors.alternate_phone) {
      setFormErrors(prev => ({
        ...prev,
        alternate_phone: ''
      }));
    }
  };

  const canSwapPhones =
    Boolean(addFormData.phone?.trim()) && Boolean(addFormData.alternate_phone?.trim());

  const handleSwapPhones = () => {
    if (!canSwapPhones) return;
    setAddFormData((prev) => ({
      ...prev,
      phone: prev.alternate_phone,
      alternate_phone: prev.phone,
    }));
  };

  const filteredAddressSuggestions = useMemo(() => {
    if (!addFormData.visible_address || addFormData.visible_address.trim().length === 0) {
      return [];
    }
    const searchTerm = addFormData.visible_address.toLowerCase();
    const uniqueAreas = [...new Set(bangaloreAreas)];
    return uniqueAreas.filter(area => 
      area.toLowerCase().includes(searchTerm)
    ).slice(0, 12);
  }, [addFormData.visible_address]);

  const handleFetchLocationFromAddress = () => {
    const address = addFormData.address || '';
    const currentAddress = address.trim();
    
    if (!currentAddress || currentAddress.length === 0) {
      toast.error('Please enter a complete address first');
      return;
    }

    const extracted = extractLocationFromAddressString(currentAddress);
    if (extracted) {
      handleAddFormChange('visible_address', extracted);
      locationManuallyEditedRef.current = false;
      toast.success(`Location extracted: ${extracted}`);
    } else {
      toast.warning('Could not extract location from address. Please enter manually.');
    }
  };

  const loadGoogleMapsScript = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (window.google && window.google.maps && window.google.maps.Geocoder) {
        resolve();
        return;
      }
      
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}&libraries=places`;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Google Maps script'));
      document.head.appendChild(script);
    });
  };

  const reverseGeocode = async (lat: number, lng: number) => {
    try {
      if (!window.google || !window.google.maps || !window.google.maps.Geocoder) {
        await loadGoogleMapsScript();
      }
      return reverseGeocodeLatLng(lat, lng);
    } catch (error) {
      console.error('Reverse geocoding error:', error);
      return null;
    }
  };

  /**
   * Read the OS clipboard and return a Google Maps URL if one is in there.
   * Returns null and surfaces a user-facing toast on every failure mode so the
   * caller doesn't need to know why it failed.
   * Native (admin APK): uses @capacitor/clipboard — WebView clipboard.readText
   * is blocked on Android.
   * Desktop: pass an early `navigator.clipboard.readText()` promise started in
   * the same tick as the click (before any await) so Chrome keeps user activation.
   */
  const readMapsLinkFromClipboard = async (
    earlyWebRead?: Promise<string> | null
  ): Promise<string | null> => {
    let text = '';
    try {
      if (earlyWebRead) {
        try {
          text = await earlyWebRead;
        } catch {
          // Early read can still fail (site permission). Fall back to
          // readClipboardText which also tries execCommand on desktop.
          text = await readClipboardText();
        }
      } else {
        text = await readClipboardText();
      }
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      if (code === 'clipboard_unavailable') {
        toast.error(
          'Clipboard is not available here. Paste the link into the field, then click Fetch Address.'
        );
      } else {
        toast.error(
          'Clipboard access was denied. Paste the link into the field, then click Fetch Address.'
        );
      }
      return null;
    }
    if (!text || !text.trim()) {
      toast.error('Clipboard is empty. Copy a Google Maps share link first.');
      return null;
    }
    mapsShareTextRef.current = text;
    const link = extractMapsUrlFromText(text);
    if (!link) {
      toast.error("Clipboard doesn't contain a Google Maps link.");
      return null;
    }
    return link;
  };

  const fetchAddressFromGoogleLocation = async () => {
    // Prevent overlapping runs (double-clicks, accidental Enter while busy).
    if (isFetchingAddress) return;

    // Desktop only: start clipboard read in the same tick as the click (no await
    // before this). beginWebClipboardRead() is a no-op on the admin APK.
    const fieldNow =
      extractMapsUrlFromText(googleLocationRef.current || '') ||
      sanitizeGoogleMapsInput(googleLocationRef.current || '');
    const earlyWebClipboard = !fieldNow ? beginWebClipboardRead() : null;

    setIsFetchingAddress(true);

    let loadingToast: string | number | undefined;
    try {
      let googleLocation = extractMapsUrlFromText(googleLocationRef.current || '') ||
        sanitizeGoogleMapsInput(googleLocationRef.current || '');

      if (!googleLocation) {
        // No link in the field — try the clipboard so the user can skip pasting.
        const clipboardLink = await readMapsLinkFromClipboard(earlyWebClipboard);
        if (!clipboardLink) return;

        // Race-safe: the user may have started typing during the clipboard read.
        // Re-read the latest value via the ref, NOT the captured closure.
        const latestTyped =
          extractMapsUrlFromText(googleLocationRef.current || '') ||
          sanitizeGoogleMapsInput(googleLocationRef.current || '');
        if (latestTyped) {
          googleLocation = latestTyped;
        } else {
          googleLocation = clipboardLink;
          setAddFormData((prev) => ({ ...prev, google_location: clipboardLink }));
          googleLocationRef.current = clipboardLink;
          toast.info('Pasted link from clipboard');
        }
      }

      if (!isGoogleMapsUrl(googleLocation)) {
        toast.error('Please enter a valid Google Maps link');
        return;
      }

      const token = await resolveSupabaseAccessTokenForApi();
      if (isGoogleMapsShortLink(googleLocation)) {
        loadingToast = toast.loading('Resolving short link...');
      }

      const resolved = await resolveGoogleMapsInputToCoords(googleLocation, {
        shareText: mapsShareTextRef.current,
        addressHint: addFormData.address,
        accessToken: token,
      });

      if (loadingToast !== undefined) {
        toast.dismiss(loadingToast);
        loadingToast = undefined;
      }

      if (!resolved.ok) {
        toast.error(resolved.error, { duration: 8000 });
        return;
      }

      const { coords, didExpandShortLink, placeHintUsed } = resolved;
      const stableMapsLink = `https://www.google.com/maps/place/${coords.latitude},${coords.longitude}`;
      fetchedCoordsRef.current = {
        latitude: coords.latitude,
        longitude: coords.longitude,
      };
      setAddFormData((prev) => ({ ...prev, google_location: stableMapsLink }));
      googleLocationRef.current = stableMapsLink;
      if (didExpandShortLink) {
        toast.info('Short link expanded');
      }
      if (placeHintUsed) {
        toast.info(`Found location from place name: ${placeHintUsed}`);
      }

      loadingToast = toast.loading('Fetching address from Google Maps...');

      try {
        const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
        if (apiKey && (!window.google || !window.google.maps || !window.google.maps.Geocoder)) {
          await loadGoogleMapsScript();
        }
      } catch (mapsLoadError) {
        console.warn('Google Maps script load failed; keeping coordinates:', mapsLoadError);
      }

      const geocodeResult = await reverseGeocode(coords.latitude, coords.longitude);
      // Keep raw Google line (may include Plus Code) for short-location extraction.
      const rawFormatted = geocodeResult?.formattedAddress ?? null;
      // Full Address never keeps Plus Codes like "VM99+4P".
      const address = rawFormatted
        ? removePlusCode(rawFormatted).replace(/\s+/g, ' ').trim() || null
        : null;

      // List/DB match first, then Google place components from the same Fetch (no extra API call)
      const extractedLocation = resolveVisibleAddressFromGeocode({
        formattedAddress: rawFormatted,
        addressComponents: geocodeResult?.addressComponents,
        addressHints: address ? [address] : [],
      });

      setAddFormData((prev) => ({
        ...prev,
        google_location: stableMapsLink,
        address: address ? capitalizeFirstLetter(address) : prev.address,
        visible_address: (() => {
          const next = nextVisibleAddressFromMapsFetch(
            extractedLocation,
            address,
            prev.visible_address
          );
          return next ? capitalizeFirstLetter(next) : next;
        })(),
      }));

      if (extractedLocation) {
        locationManuallyEditedRef.current = false;
      }

      if (address) {
        toast.success(`Address fetched: ${address.substring(0, 50)}${address.length > 50 ? '...' : ''}`);
        if (extractedLocation) {
          toast.info(`Location automatically identified: ${extractedLocation}`);
        }
      } else {
        toast.success(`Coordinates extracted: ${coords.latitude}, ${coords.longitude}`);
        toast.warning('Could not fetch address. Coordinates will be saved with the customer.');
        if (extractedLocation) {
          toast.info(`Location automatically identified: ${extractedLocation}`);
        }
      }
    } catch (error) {
      console.error('Error fetching address:', error);
      toast.error('Failed to fetch address. Please try again.');
    } finally {
      // Always dismiss the spinner toast and release the busy lock, no matter
      // which branch we exited through.
      if (loadingToast !== undefined) toast.dismiss(loadingToast);
      setIsFetchingAddress(false);
    }
  };

  const handleBrandInput = (serviceType: string, value: string) => {
    if (value.trim() === '') {
      setShowBrandSuggestions(false);
      return;
    }
    
    const searchTerm = value.toLowerCase();
    const allLocalBrands: string[] = [];
    Object.values(brandData).forEach(brands => {
      allLocalBrands.push(...brands);
    });
    
    const filtered = allLocalBrands.filter(brand => 
      brand.toLowerCase().includes(searchTerm) && 
      brand.toLowerCase() !== searchTerm.toLowerCase()
    ).slice(0, 10);
    
    setBrandSuggestions(filtered);
    setShowBrandSuggestions(filtered.length > 0);
  };

  const handleModelInput = (serviceType: string, value: string) => {
    if (value.trim() === '') {
      setShowModelSuggestions(false);
      return;
    }
    
    const searchTerm = value.toLowerCase();
    const brand = addFormData.equipment[serviceType]?.brand || '';
    
    const localModels: string[] = [];
    if (serviceType && brand && modelData[serviceType as keyof typeof modelData]) {
      const serviceModels = modelData[serviceType as keyof typeof modelData] as Record<string, string[]>;
      const brandKey = Object.keys(serviceModels).find(key => 
        key.toLowerCase() === brand.toLowerCase()
      );
      if (brandKey && serviceModels[brandKey]) {
        localModels.push(...(serviceModels[brandKey] || []));
      }
    }
    
    const filtered = localModels.filter(model => 
      model.toLowerCase().includes(searchTerm) && 
      model.toLowerCase() !== searchTerm.toLowerCase()
    ).slice(0, 10);
    
    setModelSuggestions(filtered);
    setShowModelSuggestions(filtered.length > 0);
  };

  const selectBrand = (serviceType: string, brand: string) => {
    handleEquipmentChange(serviceType, 'brand', brand);
    setShowBrandSuggestions(false);
  };

  const selectModel = (serviceType: string, model: string) => {
    handleEquipmentChange(serviceType, 'model', model);
    setShowModelSuggestions(false);
  };

  const handleServiceTypeToggle = (serviceType: string) => {
    if (addFormData.service_types.includes(serviceType)) {
      delete equipmentUploadingRef.current[serviceType];
      setAnyEquipmentUploading(Object.values(equipmentUploadingRef.current).some(Boolean));
    }
    setAddFormData(prev => {
      const newServiceTypes = prev.service_types.includes(serviceType)
        ? prev.service_types.filter(type => type !== serviceType)
        : [...prev.service_types, serviceType];
      
      const newEquipment = { ...prev.equipment };
      const newPhotos = { ...prev.photos };
      if (!prev.service_types.includes(serviceType)) {
        newEquipment[serviceType] = { brand: '', model: '' };
        newPhotos[serviceType] = [];
      } else {
        delete newEquipment[serviceType];
        delete newPhotos[serviceType];
      }
      
      return {
        ...prev,
        service_types: newServiceTypes,
        equipment: newEquipment,
        photos: newPhotos
      };
    });
    
    if (formErrors.service_types) {
      setFormErrors(prev => ({
        ...prev,
        service_types: ''
      }));
    }
  };

  const handlePhotosChange = (serviceType: string, photoUrls: string[]) => {
    setAddFormData(prev => ({
      ...prev,
      photos: {
        ...prev.photos,
        [serviceType]: photoUrls
      }
    }));
  };

  const handleEquipmentChange = (serviceType: string, field: 'brand' | 'model', value: string) => {
    const nextValue = capitalizeFirstLetter(value);
    setAddFormData(prev => ({
      ...prev,
      equipment: {
        ...prev.equipment,
        [serviceType]: {
          ...(prev.equipment[serviceType] || { brand: '', model: '' }),
          [field]: nextValue
        }
      }
    }));
    
    if (field === 'brand') {
      handleBrandInput(serviceType, nextValue);
    } else if (field === 'model') {
      handleModelInput(serviceType, nextValue);
    }
    
    const errorKey = `equipment.${serviceType}.${field}`;
    if (formErrors[errorKey]) {
      setFormErrors(prev => ({
        ...prev,
        [errorKey]: ''
      }));
    }
  };

  const handleStep5TextChange = (
    field: 'service_sub_type_custom' | 'lead_source_custom' | 'description',
    value: string
  ) => {
    setStep5JobData(prev => {
      const next = {
        ...prev,
        [field]: capitalizeFirstLetter(value),
      };
      if (
        field === 'service_sub_type_custom' &&
        prev.lead_source &&
        !isLeadSourceAllowCustomText(prev.lead_source)
      ) {
        next.lead_cost = getDefaultLeadCost(
          prev.lead_source,
          prev.service_sub_type,
          field === 'service_sub_type_custom' ? capitalizeFirstLetter(value) : prev.service_sub_type_custom,
        );
      }
      return next;
    });
  };

  const handleCreateCustomer = async () => {
    if (currentStep === 4) {
      setCurrentStep(5);
      return;
    }
    
    if (currentStep === 5) {
      if (shouldCreateJob) {
        if (scheduleAsFollowUp) {
          if (!followUpSchedule.followUpDate?.trim() || !followUpSchedule.followUpTime?.trim()) {
            toast.error('Please pick a follow-up date and time', TOAST_VALIDATION);
            return;
          }
        } else if (!step5JobData.scheduled_date) {
          toast.error('Please select a scheduled date', TOAST_VALIDATION);
          return;
        }
        
        if (!step5JobData.service_sub_type || step5JobData.service_sub_type.trim() === '') {
          toast.error('Please select a service sub type', TOAST_VALIDATION);
          return;
        }

        if (
          isServiceSubTypeAllowCustomText(step5JobData.service_sub_type) &&
          (!step5JobData.service_sub_type_custom || step5JobData.service_sub_type_custom.trim() === '')
        ) {
          toast.error('Please enter a custom service sub type', TOAST_VALIDATION);
          return;
        }

        if (!step5JobData.lead_source || step5JobData.lead_source.trim() === '') {
          toast.error('Please select a lead source', TOAST_VALIDATION);
          return;
        }
        
        if (
          isLeadSourceAllowCustomText(step5JobData.lead_source) &&
          (!step5JobData.lead_source_custom || step5JobData.lead_source_custom.trim() === '')
        ) {
          toast.error('Please enter a custom lead source', TOAST_VALIDATION);
          return;
        }

        if (!step5JobData.lead_cost || step5JobData.lead_cost.trim() === '') {
          toast.error('Please enter lead cost', TOAST_VALIDATION);
          return;
        }

        const leadCostNum = parseFloat(step5JobData.lead_cost);
        if (isNaN(leadCostNum) || leadCostNum < 0) {
          toast.error('Lead cost must be a valid number', TOAST_VALIDATION);
          return;
        }

        if (
          !scheduleAsFollowUp &&
          step5JobData.scheduled_time_slot === 'CUSTOM' &&
          (!step5JobData.scheduled_time_custom || step5JobData.scheduled_time_custom.trim() === '')
        ) {
          toast.error('Please choose a visit time (list or exact time)', TOAST_VALIDATION);
          return;
        }
      }
      
      await createCustomer();
    }
  };

  const createCustomer = async () => {
    setIsCreating(true);
    try {
      if (Object.values(equipmentUploadingRef.current).some(Boolean)) {
        setIsWaitingForPhotos(true);
        const finished = await waitForEquipmentUploads();
        setIsWaitingForPhotos(false);
        if (!finished) {
          toast.error('Photos are still uploading. Please wait a moment and try again.', TOAST_VALIDATION);
          return;
        }
      }

      const formData = addFormDataRef.current;
      const extractedLocation = extractLocationFromAddressString(formData.address);
      
      // Extract coordinates: prefer lat/lng embedded in the current Maps URL, then Fetch.
      // Never keep a Fetch that doesn't match the URL currently in the form.
      let latitude = 0;
      let longitude = 0;
      let googleLocation: string | null = null;
      let coordinatesExtracted = false;

      if (formData.google_location && formData.google_location.trim()) {
        const googleLocationInput = formData.google_location.trim();

        if (isGoogleMapsUrl(googleLocationInput)) {
          googleLocation = googleLocationInput;
          const extracted = extractCoordinatesFromGoogleMapsLink(googleLocationInput);
          if (extracted) {
            latitude = extracted.latitude;
            longitude = extracted.longitude;
            coordinatesExtracted = true;
          }
        } else {
          // If it looks like coordinates (lat,lng format)
          const coordMatch = googleLocationInput.match(/(-?\d+\.?\d*),\s*(-?\d+\.?\d*)/);
          if (coordMatch) {
            latitude = parseFloat(coordMatch[1]);
            longitude = parseFloat(coordMatch[2]);
            coordinatesExtracted = true;
            googleLocation = `https://www.google.com/maps/place/${latitude},${longitude}`;
          }
        }
      }

      // Fetch coords only when the current link has no embedded lat/lng (e.g. short links).
      if (
        !coordinatesExtracted &&
        fetchedCoordsRef.current &&
        fetchedCoordsRef.current.latitude !== 0 &&
        fetchedCoordsRef.current.longitude !== 0
      ) {
        latitude = fetchedCoordsRef.current.latitude;
        longitude = fetchedCoordsRef.current.longitude;
        coordinatesExtracted = true;
      }
      
      // Always store a coords URL when we have lat/lng (avoids re-resolve on assign).
      if (coordinatesExtracted && latitude !== 0 && longitude !== 0) {
        if (
          !googleLocation ||
          isGoogleMapsShortLink(googleLocation) ||
          !extractCoordinatesFromGoogleMapsLink(googleLocation)
        ) {
          googleLocation = `https://www.google.com/maps/place/${latitude},${longitude}`;
        }
      }
      
      // Collect all photos from all service types (only include uploaded URLs)
      const allPhotos: string[] = [];
      Object.values(formData.photos).forEach(photoArray => {
        (photoArray || []).forEach((url: string) => {
          if (typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'))) {
            allPhotos.push(url);
          }
        });
      });

      const customerData = {
        customer_id: '',
        full_name: formData.full_name,
        phone: formData.phone ? formatPhoneNumber(formData.phone) : '',
        alternate_phone: formData.alternate_phone ? formatPhoneNumber(formData.alternate_phone) : '',
        email: formData.email,
        address: {
          street: formData.address,
          area: '',
          city: 'Bangalore',
          state: 'Karnataka',
          pincode: ''
        },
        location: {
          latitude: latitude,
          longitude: longitude,
          formattedAddress: formData.address,
          googleLocation: googleLocation
        },
        visible_address: formData.visible_address ? formData.visible_address.trim().substring(0, VISIBLE_ADDRESS_MAX_LEN) : (extractedLocation ? extractedLocation.substring(0, VISIBLE_ADDRESS_MAX_LEN) : ''),
        service_type: (() => {
          const selectedTypes = formData.service_types;
          const validTypes = ['RO', 'SOFTENER'];
          const validSelectedTypes = selectedTypes.filter(type => validTypes.includes(type));
          if (validSelectedTypes.length === 0) return 'RO';
          if (validSelectedTypes.length === 1) return validSelectedTypes[0];
          return validSelectedTypes[0];
        })() as 'RO' | 'SOFTENER',
        brand: Object.values(formData.equipment).map(eq => eq.brand).join(', '),
        model: Object.values(formData.equipment).map(eq => eq.model).join(', '),
        preferred_language: (formData.native_language || 'ENGLISH') as 'ENGLISH' | 'HINDI' | 'KANNADA' | 'TAMIL' | 'TELUGU',
        status: formData.status as 'ACTIVE' | 'INACTIVE' | 'BLOCKED',
        notes: formData.notes,
        customer_since: new Date().toISOString(),
        preferred_time_slot: 'MORNING' as 'MORNING' | 'AFTERNOON' | 'EVENING',
        ...(allPhotos.length > 0 ? { photos: allPhotos } : {}),
      };

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
                '[AddCustomer] create returned error but row exists; treating as success',
                { phone: fallbackPhone, error: error?.message }
              );
              newCustomer = candidate as any;
              error = null;
            }
          } catch (lookupErr) {
            console.warn('[AddCustomer] phone-based fallback lookup failed', lookupErr);
          }
        }
      }
      if (error || !newCustomer) {
        throw new Error(error?.message || 'Customer create returned no data');
      }

      let newJob = null;
      let jobError = null;

      // Create job if requested
      if (shouldCreateJob && newCustomer) {
        try {
          let scheduledTimeSlot: 'MORNING' | 'AFTERNOON' | 'EVENING' = 'MORNING';
          let customTimeInRequirements = null;
          let isFlexible = false;
          const creatingFollowUp = scheduleAsFollowUp;
          const assignedTechnicianId = creatingFollowUp ? '' : step5JobData.assigned_technician_id;
          const effectiveScheduledDate = creatingFollowUp
            ? followUpSchedule.followUpDate
            : step5JobData.scheduled_date;

          if (creatingFollowUp) {
            customTimeInRequirements = followUpSchedule.followUpTime;
            const derived = deriveScheduleFromFollowUpTime(followUpSchedule.followUpTime);
            scheduledTimeSlot =
              derived.scheduled_time_slot === 'CUSTOM' ? 'EVENING' : derived.scheduled_time_slot;
          } else if (step5JobData.scheduled_time_slot === 'CUSTOM' && step5JobData.scheduled_time_custom) {
            customTimeInRequirements = step5JobData.scheduled_time_custom;
            const [hours] = step5JobData.scheduled_time_custom.split(':').map(Number);
            if (hours < 13) {
              scheduledTimeSlot = 'MORNING';
            } else if (hours < 18) {
              scheduledTimeSlot = 'AFTERNOON';
            } else {
              scheduledTimeSlot = 'EVENING';
            }
          } else if (step5JobData.scheduled_time_slot === 'FLEXIBLE') {
            isFlexible = true;
            scheduledTimeSlot = 'MORNING';
          } else {
            scheduledTimeSlot = step5JobData.scheduled_time_slot as 'MORNING' | 'AFTERNOON' | 'EVENING';
          }
          
          const jobNumber = generateJobNumber(step5JobData.service_type);
          
          // Generate 4-digit OTP if require_otp is true
          let otpCode: string | null = null;
          if (step5JobData.require_otp) {
            otpCode = Math.floor(1000 + Math.random() * 9000).toString(); // 4-digit OTP
          }

          const requirements: any[] = [{ 
            lead_source: leadSourceValueForSave(
              step5JobData.lead_source,
              step5JobData.lead_source_custom
            ),
            cost_range: step5JobData.cost_agreed || '',
            custom_time: customTimeInRequirements,
            flexible_time: isFlexible
          }];

          // Add OTP requirement if enabled
          if (step5JobData.require_otp && otpCode) {
            requirements.push({
              require_otp: true,
              otp_code: otpCode,
              otp_verified: false
            });
          }

          const leadCostNum = parseFloat(step5JobData.lead_cost) || 0;

          // Use the same address/location we sent for the customer (don't rely on API return for JSONB)
          const serviceAddress = customerData.address || {};
          const serviceLocation = customerData.location || {};

          const jobData = {
            job_number: jobNumber,
            customer_id: newCustomer.id,
            service_type: step5JobData.service_type,
            service_sub_type: isServiceSubTypeAllowCustomText(step5JobData.service_sub_type)
              ? step5JobData.service_sub_type_custom || step5JobData.service_sub_type
              : step5JobData.service_sub_type,
            brand: newCustomer.brand || customerData.brand || '',
            model: newCustomer.model || customerData.model || '',
            scheduled_date: effectiveScheduledDate,
            scheduled_time_slot: scheduledTimeSlot,
            service_address: serviceAddress,
            service_location: serviceLocation,
            status: assignedTechnicianId ? 'ASSIGNED' as const : 'PENDING' as const,
            priority: step5JobData.priority,
            description: step5JobData.description.trim() || '',
            requirements: requirements,
            estimated_cost: step5JobData.cost_agreed
              ? (parseFloat(step5JobData.cost_agreed.toString().split('-')[0].trim()) || 0)
              : 0,
            lead_cost: leadCostNum,
            payment_status: 'PENDING' as const,
            before_photos: allPhotos.length > 0 ? allPhotos : [], // Add photos from Step 3 to job's before_photos
            assigned_technician_id: assignedTechnicianId || null,
            assigned_date: assignedTechnicianId ? new Date().toISOString() : null
          };

          // Debug: Log the job data being created
          console.log('📋 Creating job with data:', {
            job_number: jobData.job_number,
            lead_source: jobData.requirements[0]?.lead_source,
            requirements: jobData.requirements,
            assigned_technician_id: jobData.assigned_technician_id
          });

          const jobResult = await db.jobs.create(jobData as any);
          newJob = jobResult.data;
          jobError = jobResult.error;
          
          if (jobError) {
            console.error('Failed to create job:', jobError);
            console.error('Job insert error details:', (jobError as { message?: string; code?: string; details?: string })?.message, (jobError as { details?: string })?.details);
          } else if (newJob) {
            console.log('✅ Job created successfully:', {
              job_id: (newJob as any).id,
              job_number: (newJob as any).job_number,
              requirements: (newJob as any).requirements
            });

            if (creatingFollowUp && (newJob as any).id) {
              try {
                const followUpPatch = await scheduleRootFollowUpOnJob(newJob as any, {
                  followUpDate: followUpSchedule.followUpDate,
                  followUpTime: followUpSchedule.followUpTime,
                  followUpReason: followUpSchedule.followUpReason,
                  autoMoveToOngoingOnDate: followUpSchedule.autoMoveToOngoingOnDate,
                  addAmcReminder: followUpSchedule.addAmcReminder,
                });
                newJob = { ...newJob, ...followUpPatch };
              } catch (followUpErr) {
                console.error('Failed to schedule follow-up on new job:', followUpErr);
                toast.error('Customer and job created, but follow-up could not be scheduled. Open the job to schedule it.');
              }
            }

            if (assignedTechnicianId) {
              try {
                const { appendJobToTechnicianVisitOrder } = await import('@/lib/adminVisitOrder');
                const visitOrder = await appendJobToTechnicianVisitOrder({
                  jobId: (newJob as any).id,
                  technicianId: assignedTechnicianId,
                  scheduledDate: effectiveScheduledDate,
                });
                if (visitOrder != null) {
                  (newJob as any).visit_order = visitOrder;
                  (newJob as any).visitOrder = visitOrder;
                }
              } catch (visitOrderErr) {
                console.warn('Visit order append skipped:', visitOrderErr);
              }

              try {
                const { jobAssignPushText, notifyTechnicianJobPush } = await import(
                  '@/lib/adminTechPushNotify'
                );
                notifyTechnicianJobPush({
                  technicianId: assignedTechnicianId,
                  jobId: newJob.id,
                  ...jobAssignPushText({ job: newJob as any, customer: newCustomer as any }),
                });
              } catch {
                // best-effort
              }

              try {
                const { notifyTechnicianJobWhatsApp } = await import('@/lib/jobTechnicianWhatsApp');
                const assignedTechRow = technicians.find(
                  (t) => t.id === step5JobData.assigned_technician_id
                );
                if (assignedTechRow) {
                  void notifyTechnicianJobWhatsApp({
                    job: { ...(newJob as any), customer: newCustomer } as any,
                    technician: {
                      id: assignedTechRow.id,
                      fullName:
                        assignedTechRow.fullName ||
                        (assignedTechRow as any).full_name ||
                        'Technician',
                      phone: assignedTechRow.phone,
                      whatsappPhone: (assignedTechRow as any).whatsappPhone,
                      whatsapp_phone: (assignedTechRow as any).whatsapp_phone,
                    },
                    mode: 'assign',
                    ctx: null,
                  });
                }
              } catch {
                // best-effort
              }
            }
            
            if (assignedTechnicianId) {
              // Send notification to assigned technician
              try {
                const { sendNotification, createJobAssignedNotification } = await import('@/lib/notifications');
                const assignedTechRow = technicians.find((t) => t.id === assignedTechnicianId);
                const jobNumberStr =
                  (newJob as any).job_number || (newJob as any).jobNumber || 'Job';
                const customerNameStr =
                  (newCustomer as any).full_name ||
                  (newCustomer as any).fullName ||
                  addFormData.full_name ||
                  'Customer';
                const technicianNameStr =
                  assignedTechRow?.full_name ||
                  assignedTechRow?.fullName ||
                  'Technician';
                const notification = createJobAssignedNotification(
                  jobNumberStr,
                  customerNameStr,
                  technicianNameStr,
                  (newJob as any).id,
                  assignedTechnicianId
                );
                await sendNotification(notification);
              } catch (notifError) {
                console.error('Error sending notification:', notifError);
                // Don't fail the job creation if notification fails
              }
            }
          }
        } catch (error) {
          console.error('Error creating job:', error);
          jobError = error as any;
        }
      }

      // Close dialog immediately to prevent empty flash
      onOpenChange(false);

      // Show combined toast message
      if (shouldCreateJob && newJob) {
        const jobNumber = (newJob as any).job_number || (newJob as any).jobNumber || 'N/A';
        if (scheduleAsFollowUp) {
          toast.success(`Customer ${newCustomer.customer_id || newCustomer.customerId} created and follow-up scheduled for Job ${jobNumber}`);
        } else {
          const assignedTech = step5JobData.assigned_technician_id
            ? technicians.find((t) => t.id === step5JobData.assigned_technician_id)
            : null;
          const techName = assignedTech
            ? ` and assigned to ${assignedTech.full_name || assignedTech.fullName || 'technician'}`
            : '';
          toast.success(`Customer ${newCustomer.customer_id || newCustomer.customerId} and Job ${jobNumber} created${techName}!`);
        }
      } else if (shouldCreateJob && jobError) {
        toast.success(`Customer ${newCustomer.customer_id || newCustomer.customerId} created successfully!`);
        toast.error('Failed to create job. Please create it manually.');
      } else {
        toast.success(`Customer ${newCustomer.customer_id || newCustomer.customerId} created successfully!`);
      }

      if (
        shouldCreateJob &&
        !scheduleAsFollowUp &&
        newJob &&
        step5JobData.assigned_technician_id &&
        onJobAssignedToTechnician
      ) {
        const serviceSubType = isServiceSubTypeAllowCustomText(step5JobData.service_sub_type)
          ? step5JobData.service_sub_type_custom || step5JobData.service_sub_type
          : step5JobData.service_sub_type;
        onJobAssignedToTechnician({
          technicianId: step5JobData.assigned_technician_id,
          serviceSubType: serviceSubType || 'Service',
          customerName:
            formData.full_name ||
            (newCustomer as { full_name?: string; fullName?: string })?.full_name ||
            (newCustomer as { fullName?: string })?.fullName ||
            'Customer',
          visibleAddress: formData.visible_address,
          address: customerData.address,
          leadSource: leadSourceValueForSave(
            step5JobData.lead_source,
            step5JobData.lead_source_custom
          ),
          customTime:
            step5JobData.scheduled_time_slot === 'CUSTOM' && step5JobData.scheduled_time_custom
              ? formatCustomTimeLabel(step5JobData.scheduled_time_custom) || undefined
              : undefined,
          description: step5JobData.description.trim() || undefined,
          agreedCost: step5JobData.cost_agreed.trim() || undefined,
        });
      }

      // Customer created — discard the saved draft and reset the form.
      clearAddCustomerDraft();
      clearLocationFetchState();
      setAddFormData(createDefaultAddFormData());
      setCurrentStep(1);
      setFormErrors({});
      setDuplicateFoundOnBlur(null);
      setShouldCreateJob(true); // Reset to true (default)
      setStep5JobData(createDefaultStep5JobData());
      setLeadCostExpanded(false);
      equipmentUploadingRef.current = {};
      setAnyEquipmentUploading(false);

      // Call onCustomerCreated with the new customer so parent can append to list (e.g. when no job created)
      await onCustomerCreated(newCustomer ?? undefined);
    } catch (error) {
      toast.error('Failed to create customer');
    } finally {
      setIsCreating(false);
      setIsWaitingForPhotos(false);
    }
  };

  return (
    <>
    <AlertDialog open={showResumePrompt} onOpenChange={(o) => { if (!o) setShowResumePrompt(false); }}>
      <AlertDialogContent className="!w-[calc(100vw-2rem)] !max-w-[calc(100vw-2rem)] sm:!w-full sm:!max-w-md p-5 sm:p-6">
        <AlertDialogHeader>
          <AlertDialogTitle>Resume previous entry?</AlertDialogTitle>
          <AlertDialogDescription>
            You have unsaved customer details from before that weren't created yet.
            {addFormData.full_name || addFormData.phone ? (
              <span className="block mt-2 font-medium text-foreground">
                {[addFormData.full_name, addFormData.phone].filter(Boolean).join(' · ')}
              </span>
            ) : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col-reverse sm:flex-row gap-2">
          <AlertDialogCancel onClick={handleStartNewEntry} className="w-full sm:w-auto mt-0">
            Start new
          </AlertDialogCancel>
          <AlertDialogAction onClick={handleResumeDraft} className="w-full sm:w-auto ">
            Resume
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dismissible={false}
        hideCloseButton
        className="w-[95vw] sm:w-[90vw] md:w-[80vw] lg:w-[60vw] xl:w-[50vw] max-w-2xl h-[90vh] max-h-[90vh] overflow-hidden flex flex-col"
      >
        <DialogHeader className="shrink-0 space-y-0 border-b pb-4 text-left">
          <div className="mb-4 flex items-center justify-between gap-3">
            <DialogTitle className="text-lg font-semibold tracking-tight">
              Add New Customer
            </DialogTitle>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              tabIndex={-1}
              className="h-10 w-10 shrink-0 rounded-md text-muted-foreground touch-manipulation hover:bg-muted/45 hover:text-foreground active:bg-muted/60 focus-visible:ring-0 focus-visible:ring-offset-0 [-webkit-tap-highlight-color:transparent]"
              onClick={() => onOpenChange(false)}
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          <div
            className="flex w-full items-start"
            role="progressbar"
            aria-valuenow={currentStep}
            aria-valuemin={1}
            aria-valuemax={ADD_CUSTOMER_STEPS.length}
            aria-label={`Step ${currentStep} of ${ADD_CUSTOMER_STEPS.length}`}
          >
            {ADD_CUSTOMER_STEPS.map((stepLabel, index) => {
              const stepNumber = index + 1;
              const isComplete = stepNumber < currentStep;
              const isCurrent = stepNumber === currentStep;
              return (
                <span key={stepLabel} className="contents">
                  <div className="flex w-8 shrink-0 flex-col items-center gap-1 sm:w-10">
                    <div
                      className={cn(
                        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors sm:h-8 sm:w-8',
                        isComplete && 'bg-sky-600 text-white',
                        isCurrent && 'bg-sky-600 text-white ring-2 ring-sky-200 ring-offset-2',
                        !isComplete && !isCurrent && 'bg-muted text-muted-foreground'
                      )}
                    >
                      {isComplete ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : stepNumber}
                    </div>
                    <span
                      className={cn(
                        'hidden w-full text-center text-[10px] font-medium leading-tight sm:block',
                        isCurrent ? 'text-sky-700' : 'text-muted-foreground'
                      )}
                    >
                      {stepLabel}
                    </span>
                  </div>
                  {index < ADD_CUSTOMER_STEPS.length - 1 && (
                    <div className="mt-3.5 flex flex-1 items-center px-0.5 sm:mt-4 sm:px-1" aria-hidden>
                      <div
                        className={cn(
                          'h-0.5 w-full rounded-full transition-colors',
                          stepNumber < currentStep ? 'bg-sky-600' : 'bg-muted'
                        )}
                      />
                    </div>
                  )}
                </span>
              );
            })}
          </div>
        </DialogHeader>
        
        <div className="py-6 px-2 sm:px-4 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
          {/* Step 1: Personal Information */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="add_full_name" className="text-sm font-medium">Full Name</Label>
                <Input
                  ref={fullNameInputRef}
                  id="add_full_name"
                  value={addFormData.full_name}
                  onChange={(e) => handleAddFormChange('full_name', e.target.value)}
                  autoCapitalize="sentences"
                  autoComplete="name"
                  placeholder="Enter full name"
                  className={`text-sm ${formErrors.full_name ? 'border-red-500' : ''}`}
                />
                {formErrors?.full_name && (
                  <p className="text-xs text-red-500">{formErrors.full_name}</p>
                )}
              </div>

              <div
                className={cn(
                  'grid items-start gap-4',
                  canSwapPhones ? 'grid-cols-1 sm:grid-cols-[1fr_auto_1fr]' : 'grid-cols-1 sm:grid-cols-2'
                )}
              >
                <div className="space-y-2">
                  <Label htmlFor="add_phone" className="text-sm font-medium">Primary Phone *</Label>
                  <Input
                    id="add_phone"
                    value={addFormData.phone}
                    onChange={(e) => { handlePhoneChange(e.target.value); setDuplicateFoundOnBlur(null); }}
                    placeholder="Enter 10-digit phone number"
                    autoComplete="tel"
                    inputMode="tel"
                    className={`text-sm ${formErrors.phone ? 'border-red-500' : ''}`}
                    required
                  />
                  {formErrors?.phone && (
                    <p className="text-xs text-red-500">{formErrors.phone}</p>
                  )}
                  {duplicateFoundOnBlur && (
                    <p className="text-xs text-amber-600">A customer with this number or email already exists.</p>
                  )}
                </div>

                {canSwapPhones && (
                  <div className="flex justify-center sm:mt-8">
                    <PhoneSwapButton onSwap={handleSwapPhones} tabIndex={-1} />
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="add_alternate_phone" className="text-sm font-medium">Alternate Phone</Label>
                  <Input
                    id="add_alternate_phone"
                    value={addFormData.alternate_phone}
                    onChange={(e) => handleAlternatePhoneChange(e.target.value)}
                    placeholder="Enter 10-digit phone number (optional)"
                    autoComplete="tel"
                    inputMode="tel"
                    className={`text-sm ${formErrors.alternate_phone ? 'border-red-500' : ''}`}
                  />
                  {formErrors?.alternate_phone && (
                    <p className="text-xs text-red-500">{formErrors.alternate_phone}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="add_email" className="text-sm font-medium">Email Address</Label>
                <Input
                  id="add_email"
                  type="email"
                  value={addFormData.email}
                  onChange={(e) => { handleAddFormChange('email', e.target.value); setDuplicateFoundOnBlur(null); }}
                  placeholder="Enter email address"
                  autoComplete="email"
                  className={`text-sm ${formErrors.email ? 'border-red-500' : ''}`}
                />
                {formErrors?.email && (
                  <p className="text-xs text-red-500">{formErrors.email}</p>
                )}
              </div>
            </div>
          )}

          {/* Step 2: Address Information */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="add_visible_address">Location</Label>
                <div className="relative">
                  <Input
                    id="add_visible_address"
                    value={addFormData.visible_address}
                    onChange={(e) => {
                      locationManuallyEditedRef.current = true;
                      handleAddFormChange('visible_address', e.target.value);
                      setVisibleAddressSuggestions(e.target.value.length > 0);
                    }}
                    autoCapitalize="sentences"
                    onFocus={() => setVisibleAddressSuggestions((addFormData.visible_address || '').length > 0)}
                    onBlur={() => {
                      setTimeout(() => setVisibleAddressSuggestions(false), 200);
                    }}
                    placeholder="e.g., Bansawadi, Koramangala, Whitefield, etc."
                    maxLength={VISIBLE_ADDRESS_MAX_LEN}
                    className="text-sm pr-9"
                  />
                  {addFormData.visible_address?.trim() ? (
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                      title="Clear location"
                      onClick={() => {
                        locationManuallyEditedRef.current = true;
                        handleAddFormChange('visible_address', '');
                        setVisibleAddressSuggestions(false);
                      }}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  ) : null}
                  {visibleAddressSuggestions && filteredAddressSuggestions.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-card border border-border rounded-md shadow-lg max-h-48 overflow-y-auto [scrollbar-gutter:stable]">
                      {filteredAddressSuggestions.map((suggestion, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            locationManuallyEditedRef.current = true;
                            handleAddFormChange('visible_address', suggestion);
                            setVisibleAddressSuggestions(false);
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-gray-100 text-sm"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">Enter a one-word location identifier for quick recognition. Start typing to see suggestions.</p>
              </div>

              <div className="space-y-2">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Label htmlFor="add_address">Complete Address</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleFetchLocationFromAddress}
                    className="w-full sm:w-auto whitespace-nowrap"
                    title="Extract or replace location from complete address"
                    disabled={!addFormData.address || addFormData.address.trim().length === 0}
                  >
                    <MapPin className="w-3 h-3 mr-1" />
                    Fetch Location
                  </Button>
                </div>
                <Textarea
                  id="add_address"
                  value={addFormData.address}
                  onChange={(e) => handleAddFormChange('address', e.target.value)}
                  autoCapitalize="sentences"
                  placeholder="Enter complete address (e.g., 123 MG Road, Koramangala, Bangalore, Karnataka, 560034)"
                  rows={3}
                  className={`resize-none ${formErrors.address ? 'border-red-500' : ''}`}
                />
                {formErrors?.address && (
                  <p className="text-sm text-red-500">{formErrors.address}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="add_google_location" className="text-sm font-medium text-foreground">
                  Google Maps Location
                </Label>
                <Input
                  id="add_google_location"
                  value={addFormData.google_location}
                  onChange={(e) => {
                    mapsShareTextRef.current = e.target.value;
                    handleAddFormChange('google_location', e.target.value);
                  }}
                  placeholder="Paste Google Maps share link here..."
                  className="w-full text-sm"
                />
                <div className={`grid gap-2 ${addFormData.google_location ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={fetchAddressFromGoogleLocation}
                    disabled={isFetchingAddress}
                    aria-busy={isFetchingAddress}
                    className="w-full whitespace-nowrap"
                    title={
                      addFormData.google_location
                        ? 'Fetch address from Google Maps link'
                        : 'Paste from clipboard and fetch address'
                    }
                  >
                    {isFetchingAddress ? (
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    ) : (
                      <Download className="w-3 h-3 mr-1" />
                    )}
                    {isFetchingAddress ? 'Fetching…' : 'Fetch Address'}
                  </Button>
                  {addFormData.google_location && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const link =
                          extractMapsUrlFromText(addFormData.google_location) ||
                          sanitizeGoogleMapsInput(addFormData.google_location);
                        window.open(link, '_blank', 'noopener,noreferrer');
                      }}
                      className="w-full whitespace-nowrap"
                      title="Open in Google Maps"
                    >
                      <ExternalLink className="w-3 h-3 mr-1" />
                      Test
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Service Information */}
          {currentStep === 3 && (
            <div className="space-y-4">
              <div className="space-y-3">
                <Label>Service Types</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { value: 'RO', label: 'RO (Reverse Osmosis)' },
                    { value: 'SOFTENER', label: 'Water Softener' }
                  ].map((service) => (
                    <div
                      key={service.value}
                      onClick={() => handleServiceTypeToggle(service.value)}
                      className={`p-3 border-2 rounded-lg cursor-pointer transition-all ${
                        addFormData.service_types.includes(service.value)
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-border hover:border-border'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{service.label}</span>
                      </div>
                    </div>
                  ))}
                </div>
                {formErrors?.service_types && (
                  <p className="text-sm text-red-500">{formErrors.service_types}</p>
                )}
              </div>
            </div>
          )}

          {/* Equipment + photos stay mounted (hidden off step 3) so uploads can finish in the background */}
          {addFormData.service_types.length > 0 && (
            <div className={currentStep === 3 ? 'space-y-4' : 'hidden'} aria-hidden={currentStep !== 3}>
                  <Label className="text-base font-semibold">Equipment Details</Label>
                  {addFormData.service_types.map((serviceType) => {
                    const serviceInfo = [
                      { value: 'RO', label: 'RO (Reverse Osmosis)' },
                      { value: 'SOFTENER', label: 'Water Softener' }
                    ].find(s => s.value === serviceType);
                    
                    const equipment = addFormData.equipment[serviceType] || { brand: '', model: '' };
                    const photos = addFormData.photos[serviceType] ?? EMPTY_PHOTO_LIST;
                    
                    return (
                      <div key={serviceType} className="bg-muted/40 p-4 rounded-lg space-y-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground">{serviceInfo?.label}</span>
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-2 relative">
                            <Label htmlFor={`brand_${serviceType}`}>Brand</Label>
                            <Input
                              id={`brand_${serviceType}`}
                              value={equipment.brand}
                              onChange={(e) => handleEquipmentChange(serviceType, 'brand', e.target.value)}
                              autoCapitalize="sentences"
                              placeholder={`Enter ${serviceType} brand`}
                              className={formErrors[`equipment.${serviceType}.brand`] ? 'border-red-500' : ''}
                              onBlur={() => {
                                setTimeout(() => setShowBrandSuggestions(false), 200);
                              }}
                            />
                            {showBrandSuggestions && brandSuggestions.length > 0 && (
                              <div className="absolute z-10 w-full mt-1 bg-card border border-border rounded-md shadow-lg max-h-40 overflow-y-auto [scrollbar-gutter:stable]">
                                {brandSuggestions.map((brand, index) => (
                                  <div
                                    key={index}
                                    className="px-3 py-2 hover:bg-accent hover:text-accent-foreground cursor-pointer text-sm text-foreground"
                                    onClick={() => selectBrand(serviceType, brand)}
                                  >
                                    {brand}
                                  </div>
                                ))}
                              </div>
                            )}
                            {formErrors?.[`equipment.${serviceType}.brand`] && (
                              <p className="text-sm text-red-500">{formErrors[`equipment.${serviceType}.brand`]}</p>
                            )}
                          </div>

                          <div className="space-y-2 relative">
                            <Label htmlFor={`model_${serviceType}`}>Model</Label>
                            <Input
                              id={`model_${serviceType}`}
                              value={equipment.model}
                              onChange={(e) => handleEquipmentChange(serviceType, 'model', e.target.value)}
                              autoCapitalize="sentences"
                              placeholder={`Enter ${serviceType} model`}
                              className={formErrors[`equipment.${serviceType}.model`] ? 'border-red-500' : ''}
                              onBlur={() => {
                                setTimeout(() => setShowModelSuggestions(false), 200);
                              }}
                            />
                            {showModelSuggestions && modelSuggestions.length > 0 && (
                              <div className="absolute z-10 w-full mt-1 bg-card border border-border rounded-md shadow-lg max-h-40 overflow-y-auto [scrollbar-gutter:stable]">
                                {modelSuggestions.map((model, index) => (
                                  <div
                                    key={index}
                                    className="px-3 py-2 hover:bg-accent hover:text-accent-foreground cursor-pointer text-sm text-foreground"
                                    onClick={() => selectModel(serviceType, model)}
                                  >
                                    {model}
                                  </div>
                                ))}
                              </div>
                            )}
                            {formErrors?.[`equipment.${serviceType}.model`] && (
                              <p className="text-sm text-red-500">{formErrors[`equipment.${serviceType}.model`]}</p>
                            )}
                          </div>
                        </div>

                        {/* Photo Upload Section */}
                        <div className="space-y-2 mt-4">
                          <Label>Add Photo</Label>
                          <ImageUpload
                            onImagesChange={(photoUrls) => handlePhotosChange(serviceType, photoUrls)}
                            onUploadStateChange={(uploading) => handleEquipmentUploadState(serviceType, uploading)}
                            maxImages={5}
                            folder="customer-equipment"
                            title={`${serviceInfo?.label} Photo`}
                            description={`Upload photo of ${serviceInfo?.label} equipment`}
                            initialImages={photos}
                            maxWidth={1280}
                            quality={0.7}
                            compact
                            skipOfflineQueue
                          />
                          {anyEquipmentUploading && currentStep === 3 && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                              <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                              Photo uploading — you can continue; it will finish when you create the customer.
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
            </div>
          )}

          {/* Step 4: Review & Notes */}
          {currentStep === 4 && (
            <div className="space-y-4">
              <div className="bg-muted/40 p-4 rounded-lg space-y-3">
                <h3 className="font-semibold text-foreground">Customer Information Summary</h3>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium text-muted-foreground">Name:</span>
                    <p className="text-foreground">{addFormData.full_name || 'Not provided'}</p>
                  </div>
                  <div>
                    <span className="font-medium text-muted-foreground">Phone:</span>
                    <p className="text-foreground">{addFormData.phone || 'Not provided'}</p>
                  </div>
                  {addFormData.alternate_phone && (
                    <div>
                      <span className="font-medium text-muted-foreground">Alternate Phone:</span>
                      <p className="text-foreground">{addFormData.alternate_phone}</p>
                    </div>
                  )}
                  <div>
                    <span className="font-medium text-muted-foreground">Email:</span>
                    <p className="text-foreground">{addFormData.email || 'Not provided'}</p>
                  </div>
                  <div className="sm:col-span-2">
                    <span className="font-medium text-muted-foreground">Location:</span>
                    <p className="text-foreground">{addFormData.visible_address || 'Not provided'}</p>
                    <span className="font-medium text-muted-foreground">Complete Address:</span>
                    <p className="text-foreground">{addFormData.address || 'Not provided'}</p>
                    {addFormData.google_location && (
                      <div className="mt-1">
                        <span className="font-medium text-muted-foreground">Google Maps:</span>
                        <p className="text-blue-600 text-sm break-all">{addFormData.google_location}</p>
                      </div>
                    )}
                  </div>
                  <div className="sm:col-span-2">
                    <span className="font-medium text-muted-foreground">Services & Equipment:</span>
                    <div className="mt-1 space-y-2">
                      {addFormData.service_types.map((serviceType) => {
                        const serviceInfo = [
                          { value: 'RO', label: 'RO (Reverse Osmosis)' },
                          { value: 'SOFTENER', label: 'Water Softener' }
                        ].find(s => s.value === serviceType);
                        
                        const equipment = addFormData.equipment[serviceType];
                        
                        return (
                          <div key={serviceType} className="flex items-center gap-2 text-sm">
                            <span className="font-medium">{serviceInfo?.label}:</span>
                            <span className="text-foreground/90">
                              {equipment?.brand} - {equipment?.model}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 5: Create Job Option */}
          {currentStep === 5 && (
            <div className="space-y-4">
              {anyEquipmentUploading && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5 px-1">
                  <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                  Equipment photo still uploading — Create Customer will wait until it finishes.
                </p>
              )}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <h3 className="font-semibold text-foreground mb-2">Create a New Job?</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Would you like to create a new job for this customer right away?
                </p>
                
                <div className="space-y-3">
                  <label className={`flex items-center gap-3 p-3 bg-card rounded-lg border-2 cursor-pointer transition-all hover:border-blue-300 ${shouldCreateJob ? 'border-blue-500' : 'border-border'}`}>
                    <input
                      type="radio"
                      name="createJob"
                      checked={shouldCreateJob === true}
                      onChange={() => {
                        setShouldCreateJob(true);
                        setStep5JobData(prev => ({
                          ...prev,
                          scheduled_date: getDefaultNewJobScheduledDate(),
                          service_type: addFormData.service_types[0] === 'SOFTENER' ? 'SOFTENER' : 'RO'
                        }));
                      }}
                      className="h-4 w-4 text-blue-600"
                    />
                    <div>
                      <span className="font-medium text-foreground">Yes, create a new job</span>
                      <p className="text-xs text-muted-foreground mt-1">Fill in the job details below</p>
                    </div>
                  </label>
                  
                  <label className={`flex items-center gap-3 p-3 bg-card rounded-lg border-2 cursor-pointer transition-all hover:border-blue-300 ${!shouldCreateJob ? 'border-blue-500' : 'border-border'}`}>
                    <input
                      type="radio"
                      name="createJob"
                      checked={shouldCreateJob === false}
                      onChange={() => {
                        setShouldCreateJob(false);
                        setScheduleAsFollowUp(false);
                      }}
                      className="h-4 w-4 text-blue-600"
                    />
                    <div>
                      <span className="font-medium text-foreground">No, just create the customer</span>
                      <p className="text-xs text-muted-foreground mt-1">You can create a job later from the customer's profile</p>
                    </div>
                  </label>
                </div>
              </div>

              {shouldCreateJob && (
                <div className="space-y-4 border-t pt-4">
                  <h4 className="font-semibold text-foreground">Job Information</h4>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="step5_service_type">Service Type</Label>
                      <Select
                        value={step5JobData.service_type}
                        onValueChange={(value) => setStep5JobData(prev => ({ ...prev, service_type: value as 'RO' | 'SOFTENER' }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="RO">RO</SelectItem>
                          <SelectItem value="SOFTENER">Softener</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <ServiceSubTypeSelect
                      id="step5_service_sub_type"
                      value={step5JobData.service_sub_type}
                      customValue={step5JobData.service_sub_type_custom}
                      serviceType={step5JobData.service_type}
                      required
                      onChange={(value) =>
                        setStep5JobData((prev) => {
                          const next = {
                            ...prev,
                            service_sub_type: value,
                            service_sub_type_custom: isServiceSubTypeAllowCustomText(value)
                              ? prev.service_sub_type_custom
                              : '',
                          };
                          if (prev.lead_source && !isLeadSourceAllowCustomText(prev.lead_source)) {
                            next.lead_cost = getDefaultLeadCost(
                              prev.lead_source,
                              next.service_sub_type,
                              next.service_sub_type_custom
                            );
                          }
                          return next;
                        })
                      }
                      onCustomChange={(v) => handleStep5TextChange('service_sub_type_custom', v)}
                    />

                    {!scheduleAsFollowUp && (
                    <>
                    <div className="space-y-2">
                      <Label htmlFor="step5_scheduled_date">Scheduled Date</Label>
                      <DatePicker
                        value={step5JobData.scheduled_date || undefined}
                        onChange={(v) => v && setStep5JobData(prev => ({ ...prev, scheduled_date: v }))}
                        placeholder="Pick date"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="step5_scheduled_time_slot">Time Slot</Label>
                      <Select
                        value={step5JobData.scheduled_time_slot}
                        onValueChange={(value) => setStep5JobData(prev => ({ 
                          ...prev, 
                          scheduled_time_slot: value as 'MORNING' | 'AFTERNOON' | 'EVENING' | 'FLEXIBLE' | 'CUSTOM'
                        }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="MORNING">Morning (9 AM - 1 PM)</SelectItem>
                          <SelectItem value="AFTERNOON">Afternoon (1 PM - 6 PM)</SelectItem>
                          <SelectItem value="EVENING">Evening (6 PM - 9 PM)</SelectItem>
                          <SelectItem value="FLEXIBLE">Flexible</SelectItem>
                          <SelectItem value="CUSTOM">Custom time</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {step5JobData.scheduled_time_slot === 'CUSTOM' && (
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="step5_scheduled_time_custom">Visit time</Label>
                        <CustomAppointmentTimeSelect
                          id="step5_scheduled_time_custom"
                          value={step5JobData.scheduled_time_custom}
                          onChange={(hhmm) => setStep5JobData(prev => ({ ...prev, scheduled_time_custom: hhmm }))}
                        />
                      </div>
                    )}
                    </>
                    )}

                    <LeadSourceSelect
                      id="step5_lead_source"
                      required
                      value={step5JobData.lead_source || ''}
                      customValue={step5JobData.lead_source_custom}
                      onChange={(value) => {
                        setStep5JobData((prev) => ({
                          ...prev,
                          lead_source: value,
                          lead_source_custom: isLeadSourceAllowCustomText(value)
                            ? prev.lead_source_custom
                            : '',
                          lead_cost: getDefaultLeadCost(
                            value,
                            prev.service_sub_type,
                            prev.service_sub_type_custom
                          ),
                          require_otp: isLeadSourceRequiresOtp(value),
                        }));
                      }}
                      onCustomChange={(v) => handleStep5TextChange('lead_source_custom', v)}
                    />

                    <div className="space-y-2">
                      <Label htmlFor="step5_lead_cost">Lead Cost (₹) *</Label>
                      {leadCostExpanded ? (
                        <div className="relative">
                          <Input
                            id="step5_lead_cost"
                            type="number"
                            min="0"
                            step="0.01"
                            value={step5JobData.lead_cost}
                            onChange={(e) => setStep5JobData(prev => ({ ...prev, lead_cost: e.target.value }))}
                            placeholder="Enter lead cost"
                            disabled={!step5JobData.lead_source}
                            className="pr-10 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            required
                          />
                          <button
                            type="button"
                            onClick={() => setLeadCostExpanded(false)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                            aria-label="Hide lead cost"
                          >
                            <ChevronDown className="h-4 w-4 rotate-180" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setLeadCostExpanded(true)}
                          className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background hover:bg-accent/50"
                        >
                          <span className="font-mono text-sm text-muted-foreground tracking-widest">••••</span>
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        </button>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="step5_cost_agreed">Cost Already Agreed (₹)</Label>
                      <Input
                        id="step5_cost_agreed"
                        type="text"
                        value={step5JobData.cost_agreed}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value === '' || /^[\d\s-]+$/.test(value)) {
                            setStep5JobData(prev => ({ ...prev, cost_agreed: value }));
                          }
                        }}
                        placeholder="e.g., 400 or 400-500"
                      />
                      <p className="text-xs text-muted-foreground">Enter a single amount or a range (e.g., 400-500)</p>
                    </div>

                    {!scheduleAsFollowUp && (
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="step5_technician">Assign to Technician (Optional)</Label>
                      <Select
                        value={step5JobData.assigned_technician_id || 'none'}
                        onValueChange={(value) => setStep5JobData(prev => ({ ...prev, assigned_technician_id: value === 'none' ? '' : value }))}
                        disabled={loadingTechnicians}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={loadingTechnicians ? "Loading technicians..." : "Select technician (optional)"} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None (Assign later)</SelectItem>
                          {technicians
                            .filter((tech) => tech && tech.id && tech.full_name)
                            .map((tech) => (
                              <SelectItem key={tech.id} value={tech.id || ''}>
                                {tech.full_name || 'Unknown'} {tech.employee_id ? `(${tech.employee_id})` : ''}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      {step5JobData.assigned_technician_id && (
                        <p className="text-xs text-muted-foreground">
                          Job will be assigned to selected technician immediately
                        </p>
                      )}
                    </div>
                    )}

                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="step5_description">Description (Optional)</Label>
                      <Textarea
                        id="step5_description"
                        value={step5JobData.description}
                        onChange={(e) => handleStep5TextChange('description', e.target.value)}
                        autoCapitalize="sentences"
                        placeholder="Enter job description"
                        rows={3}
                      />
                    </div>

                    {/* OTP Verification Toggle */}
                    <div className="space-y-2 sm:col-span-2 pt-2 border-t border-border">
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id="step5_require_otp"
                          checked={step5JobData.require_otp}
                          onChange={(e) => setStep5JobData(prev => ({ ...prev, require_otp: e.target.checked }))}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-border rounded"
                        />
                        <Label htmlFor="step5_require_otp" className="cursor-pointer">
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
            </div>
          )}
        </div>

        <DialogFooter className="flex-shrink-0 flex flex-col sm:flex-row gap-2 sm:gap-0 sm:justify-between pt-4 border-t">
          <div className="flex gap-2 order-2 sm:order-1">
            {currentStep > 1 && (
              <Button variant="outline" onClick={prevStep} className="flex-1 sm:flex-none text-sm">
                Previous
              </Button>
            )}
          </div>
          
          <div className="order-1 sm:order-2">
            {currentStep < 4 ? (
              <Button onClick={nextStep} className=" w-full sm:w-auto text-sm">
                Next Step
              </Button>
            ) : currentStep === 4 ? (
              <Button onClick={nextStep} className=" w-full sm:w-auto text-sm">
                Next Step
              </Button>
            ) : (
              <Button 
                onClick={handleCreateCustomer}
                disabled={
                  isCreating ||
                  (shouldCreateJob && !isJobCreateFormComplete(step5JobData))
                }
                className="bg-green-600 hover:bg-green-700 w-full sm:w-auto text-sm"
              >
                {isCreating ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    {isWaitingForPhotos ? 'Uploading photos...' : 'Creating...'}
                  </div>
                ) : shouldCreateJob ? (
                  'Create & Schedule'
                ) : (
                  'Create Customer'
                )}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
};

export default AddCustomerDialog;

