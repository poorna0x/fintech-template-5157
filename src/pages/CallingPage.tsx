import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { useWhatsAppCloudApiGate } from '@/hooks/useWhatsAppCloudApiGate';
import { 
  Phone, 
  MessageCircle, 
  ArrowLeft,
  ArrowRight,
  Search, 
  Filter,
  Calendar,
  Mail,
  CheckCircle2,
  XCircle,
  Edit,
  Lock,
  Camera,
  FileText,
  Loader2,
  Send,
  ChevronDown,
  Users
} from 'lucide-react';

// WhatsApp Icon Component
const WhatsAppIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488"/>
  </svg>
);
import { toast } from 'sonner';
import { registerAdminPWA } from '@/lib/pwa';
import { db, supabase, type CallingPageRpcRow } from '@/lib/supabase';
import { Customer } from '@/types';
import { formatPhoneForWhatsApp } from '@/lib/utils';
import { customerNameClassName } from '@/lib/customerDisplay';
import CustomerPhotoGalleryDialog from '@/components/admin/CustomerPhotoGalleryDialog';
import CustomerReportDialog from '@/components/admin/CustomerReportDialog';
import PhotoViewerDialog from '@/components/admin/PhotoViewerDialog';
import CallingBulkWhatsAppDialog from '@/components/admin/CallingBulkWhatsAppDialog';
import { WhatsAppCustomizeSendDialog } from '@/components/admin/WhatsAppCustomizeSendDialog';
import { Checkbox } from '@/components/ui/checkbox';
import { useSuspendDialogForPhotoViewer } from '@/lib/suspendDialogForPhotoViewer';
import { resolveCustomerSendBrand } from '@/lib/admin-email-sources';
import {
  buildCallingWhatsAppMessage,
  callingContextFromCustomer,
  CALLING_WA_TEMPLATE_META,
  CALLING_WA_TEMPLATE_ORDER,
  type CallingWhatsAppTemplate,
} from '@/lib/calling-whatsapp-templates';
import type { DocumentBrand } from '@/lib/service-brands';
import { getDocumentBrandLabel } from '@/lib/service-brands';

interface CallHistory {
  id: string;
  customer_id: string;
  contact_type: 'CALL' | 'WHATSAPP' | 'SMS' | 'EMAIL';
  phone_number: string;
  message_sent?: string;
  status: string;
  notes?: string;
  contacted_at: string;
}

interface CustomerWithHistory extends Customer {
  lastServiceDate?: string;
  daysSinceService?: number;
  lastServiceSubType?: string | null;
  lastServiceType?: string | null;
  lastContacted?: string;
  daysSinceContact?: number;
  lastContactStatus?: string;
  lastContactType?: string | null;
  lastWhatsAppAt?: string;
  daysSinceWhatsApp?: number;
  lastWhatsAppStatus?: string | null;
  hasPrefilter?: boolean | null;
  rawWaterTds?: number;
  callHistory?: CallHistory[];
}

interface CallingPageProps {
  hideHeader?: boolean;
  onBack?: () => void;
}

function mapCallingRowToCustomer(row: CallingPageRpcRow): CustomerWithHistory {
  return {
    id: row.id,
    customerId: row.customer_id,
    fullName: row.full_name,
    phone: row.phone,
    alternatePhone: row.alternate_phone ?? undefined,
    email: row.email ?? undefined,
    address: { street: '', area: '', city: '', state: '', pincode: '' },
    location: { latitude: 0, longitude: 0, formattedAddress: '' },
    serviceType: row.service_type as Customer['serviceType'],
    brand: row.brand,
    model: row.model,
    status: row.status as Customer['status'],
    hasPrefilter: row.has_prefilter ?? null,
    rawWaterTds: row.raw_water_tds ?? 0,
    lastServiceDate: row.last_service_at ?? row.last_service_date ?? undefined,
    daysSinceService: row.days_since_service ?? undefined,
    lastServiceSubType: row.last_service_sub_type ?? null,
    lastServiceType: row.last_service_type ?? null,
    lastContacted: row.last_contacted_at ?? undefined,
    daysSinceContact: row.days_since_contact ?? undefined,
    lastContactStatus: row.last_contact_status ?? undefined,
    lastContactType: row.last_contact_type ?? null,
    lastWhatsAppAt: row.last_whatsapp_at ?? undefined,
    daysSinceWhatsApp: row.days_since_whatsapp ?? undefined,
    lastWhatsAppStatus: row.last_whatsapp_status ?? null,
    callHistory: [],
    customer_tier: row.customer_tier ?? undefined,
  } as CustomerWithHistory;
}

/** DB call_history.status allows: COMPLETED, FAILED, NO_ANSWER, BUSY */
function normalizeCallHistoryStatus(status: string): string {
  switch (status) {
    case 'ANSWERED':
    case 'DELIVERED':
      return 'COMPLETED';
    case 'NOT_DELIVERED':
      return 'FAILED';
    default:
      return status;
  }
}

const CallingPage = ({ hideHeader = false, onBack }: CallingPageProps = {}) => {
  const { cloudApiOn } = useWhatsAppCloudApiGate('calling');
  const navigate = useNavigate();
  const { user, isAdmin, authInitializing } = useAuth();
  const [pageRows, setPageRows] = useState<CustomerWithHistory[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState({ overOneYear: 0, sixToTwelve: 0 });
  const [listLoading, setListLoading] = useState(true);
  const [serverPaginated, setServerPaginated] = useState(true);
  const [fallbackLoadProgress, setFallbackLoadProgress] = useState(0);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [serviceFilter, setServiceFilter] = useState<string>('all');
  const [serviceHistoryFilter, setServiceHistoryFilter] = useState<string>('all'); // 'all', 'serviced', 'never'
  const [serviceSubTypeFilter, setServiceSubTypeFilter] = useState<string>('all'); // 'all', specific last service_sub_type
  const [showRecentlyContacted, setShowRecentlyContacted] = useState(false);
  const [recentContactDays, setRecentContactDays] = useState(7); // Don't show if contacted within 7 days
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [prefilterFilter, setPrefilterFilter] = useState<string>('all'); // 'all', 'yes', 'no', 'unknown'
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [isMdUp, setIsMdUp] = useState(false);
  const filterSignature = useMemo(
    () =>
      JSON.stringify({
        debouncedSearch,
        serviceFilter,
        serviceHistoryFilter,
        serviceSubTypeFilter,
        showRecentlyContacted,
        recentContactDays,
        statusFilter,
        prefilterFilter,
      }),
    [
      debouncedSearch,
      serviceFilter,
      serviceHistoryFilter,
      serviceSubTypeFilter,
      showRecentlyContacted,
      recentContactDays,
      statusFilter,
      prefilterFilter,
    ]
  );
  const prevFilterSignatureRef = useRef(filterSignature);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const sync = () => setIsMdUp(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (debouncedSearch.trim()) n++;
    if (serviceFilter !== 'all') n++;
    if (serviceHistoryFilter !== 'all') n++;
    if (serviceSubTypeFilter !== 'all') n++;
    if (showRecentlyContacted) n++;
    if (statusFilter !== 'all') n++;
    if (prefilterFilter !== 'all') n++;
    return n;
  }, [
    debouncedSearch,
    serviceFilter,
    serviceHistoryFilter,
    serviceSubTypeFilter,
    showRecentlyContacted,
    statusFilter,
    prefilterFilter,
  ]);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [pendingContact, setPendingContact] = useState<{
    customerId: string;
    contactType: 'CALL' | 'WHATSAPP' | 'SMS' | 'EMAIL';
    phoneNumber?: string;
    message?: string;
  } | null>(null);
  const [contactStatus, setContactStatus] = useState<string>('COMPLETED');
  const [contactNotes, setContactNotes] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [whatsappDialogOpen, setWhatsappDialogOpen] = useState(false);
  const [selectedCustomerForWhatsApp, setSelectedCustomerForWhatsApp] = useState<CustomerWithHistory | null>(null);
  const [selectedBulk, setSelectedBulk] = useState<Map<string, CustomerWithHistory>>(
    () => new Map()
  );
  const [selectingMatching, setSelectingMatching] = useState(false);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkQueue, setBulkQueue] = useState<CustomerWithHistory[]>([]);
  const [customerPhotoGalleryOpen, setCustomerPhotoGalleryOpen] = useState(false);
  const [selectedCustomerForPhotos, setSelectedCustomerForPhotos] = useState<Customer | null>(null);
  const [customerPhotos, setCustomerPhotos] = useState<string[]>([]);
  const [isLoadingPhotos, setIsLoadingPhotos] = useState(false);
  const [customerReportDialogOpen, setCustomerReportDialogOpen] = useState(false);
  const [selectedCustomerForReport, setSelectedCustomerForReport] = useState<Customer | null>(null);
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [reportPhotoViewerOpen, setReportPhotoViewerOpen] = useState(false);
  const [reportSelectedPhoto, setReportSelectedPhoto] = useState<{ url: string; index: number; total: number } | null>(null);
  const [reportSelectedBillPhotos, setReportSelectedBillPhotos] = useState<string[] | null>(null);
  const {
    openSuspendedViewer,
    closeSuspendedViewer,
    ignoreParentDismissWhileSuspended,
  } = useSuspendDialogForPhotoViewer();

  useEffect(() => {
    if (!hideHeader) {
      registerAdminPWA();
    }
  }, [hideHeader]);

  // Redirect to admin login if not authenticated or not admin (only if standalone page)
  useEffect(() => {
    if (!hideHeader && !authInitializing) {
      if (!user || !isAdmin) {
        toast.error('Access denied. Admin authentication required.');
        navigate('/admin');
      }
    }
  }, [user, isAdmin, authInitializing, navigate, hideHeader]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchTerm.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  const fetchPage = useCallback(async (pageOverride?: number) => {
    const filtersChanged = prevFilterSignatureRef.current !== filterSignature;
    if (filtersChanged) {
      prevFilterSignatureRef.current = filterSignature;
      if (currentPage !== 1) {
        setCurrentPage(1);
        return;
      }
    }

    const pageToLoad = pageOverride ?? currentPage;

    try {
      setListLoading(true);
      const { data, error } = await db.calling.getPage({
        page: pageToLoad,
        limit: itemsPerPage,
        search: debouncedSearch,
        serviceFilter,
        serviceHistoryFilter,
        serviceSubTypeFilter,
        showRecentlyContacted,
        recentContactDays,
        statusFilter,
        prefilterFilter,
        onFallbackProgress: setFallbackLoadProgress,
      });

      if (error || !data) {
        throw error ?? new Error('No data returned');
      }

      setServerPaginated(data.server_paginated);
      setTotalCount(data.total);
      setStats({
        overOneYear: data.stats.over_one_year,
        sixToTwelve: data.stats.six_to_twelve,
      });
      setPageRows((data.rows ?? []).map(mapCallingRowToCustomer));
    } catch (error) {
      console.error('Error loading calling page:', error);
      toast.error('Failed to load customers');
      setPageRows([]);
      setTotalCount(0);
      setStats({ overOneYear: 0, sixToTwelve: 0 });
    } finally {
      setListLoading(false);
      setFallbackLoadProgress(0);
    }
  }, [
    currentPage,
    itemsPerPage,
    filterSignature,
    debouncedSearch,
    serviceFilter,
    serviceHistoryFilter,
    serviceSubTypeFilter,
    showRecentlyContacted,
    recentContactDays,
    statusFilter,
    prefilterFilter,
  ]);

  useEffect(() => {
    // Filters change who is in the list — drop the previous WhatsApp queue.
    // Keep ticks when only the page number changes so you can pick across pages.
    setSelectedBulk(new Map());
  }, [filterSignature]);

  useEffect(() => {
    setSelectedBulk((prev) => {
      if (prev.size === 0) return prev;
      let changed = false;
      const next = new Map(prev);
      for (const customer of pageRows) {
        if (!next.has(customer.id)) continue;
        next.set(customer.id, customer);
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [pageRows]);

  useEffect(() => {
    if (hideHeader || (!authInitializing && user && isAdmin)) {
      void fetchPage();
    }
  }, [fetchPage, hideHeader, authInitializing, user, isAdmin]);

  // Lazy-load technicians only when report dialog is opened (saves one DB round-trip on page load)
  useEffect(() => {
    if (!customerReportDialogOpen || technicians.length > 0) return;
    const loadTechnicians = async () => {
      const { data, error } = await db.technicians.getList(100);
      if (!error && data) setTechnicians(data);
    };
    loadTechnicians();
  }, [customerReportDialogOpen]);

  const recordCall = async (
    customerId: string,
    contactType: 'CALL' | 'WHATSAPP' | 'SMS' | 'EMAIL',
    phoneNumber?: string,
    message?: string,
    status?: string,
    notes?: string,
    options?: { quiet?: boolean }
  ) => {
    try {
      const dbStatus = normalizeCallHistoryStatus(status || 'COMPLETED');
      const { error } = await db.callHistory.create({
        customer_id: customerId,
        contact_type: contactType,
        phone_number: phoneNumber,
        message_sent: message,
        status: dbStatus,
        notes: notes
      });

      if (error) throw error;

      const now = new Date().toISOString();
      setPageRows(prev => prev.map(c => {
        if (c.id !== customerId) return c;
        if (contactType === 'WHATSAPP') {
          return {
            ...c,
            lastWhatsAppAt: now,
            daysSinceWhatsApp: 0,
            lastWhatsAppStatus: dbStatus,
          };
        }
        if (contactType === 'CALL') {
          return {
            ...c,
            lastContacted: now,
            daysSinceContact: 0,
            lastContactStatus: dbStatus,
            lastContactType: 'CALL',
          };
        }
        return c;
      }));
      if (!options?.quiet) {
        toast.success('Contact recorded');
      }
    } catch (error) {
      console.error('Error recording call:', error);
      toast.error('Failed to save contact to database');
    }
  };

  const handleStatusDialogClose = () => {
    setStatusDialogOpen(false);
    setPendingContact(null);
    setContactStatus('COMPLETED');
    setContactNotes('');
  };

  const handleStatusSubmit = async () => {
    if (!pendingContact) return;

    await recordCall(
      pendingContact.customerId,
      pendingContact.contactType,
      pendingContact.phoneNumber,
      pendingContact.message,
      contactStatus,
      contactNotes
    );

    handleStatusDialogClose();
  };

  const openStatusDialog = (customer: CustomerWithHistory, contactType: 'CALL' | 'WHATSAPP' | 'SMS' | 'EMAIL', phoneNumber?: string, message?: string) => {
    setPendingContact({
      customerId: customer.id,
      contactType,
      phoneNumber,
      message
    });
    setContactStatus(contactType === 'CALL' ? 'NO_ANSWER' : 'COMPLETED');
    setContactNotes('');
    setStatusDialogOpen(true);
  };

  const handleCall = (customer: CustomerWithHistory) => {
    const phoneNumber = customer.phone?.replace(/\D/g, '');
    if (phoneNumber) {
      window.open(`tel:${phoneNumber}`, '_self');
      // Open status dialog after a short delay to allow call to initiate
      setTimeout(() => {
        openStatusDialog(customer, 'CALL', customer.phone);
      }, 500);
    }
  };

  const waMessageContext = useMemo(
    () =>
      selectedCustomerForWhatsApp
        ? callingContextFromCustomer(selectedCustomerForWhatsApp)
        : null,
    [selectedCustomerForWhatsApp]
  );

  const handleWhatsApp = (customer: CustomerWithHistory) => {
    if (!customer.phone?.replace(/\D/g, '') && !customer.alternatePhone?.replace(/\D/g, '')) {
      toast.error('Phone number not available');
      return;
    }
    setSelectedCustomerForWhatsApp(customer);
    setWhatsappDialogOpen(true);
  };

  const pageSelectableIds = useMemo(
    () =>
      pageRows
        .filter((c) => String(c.phone || '').replace(/\D/g, '').length >= 10)
        .map((c) => c.id),
    [pageRows]
  );

  const allPageSelected =
    pageSelectableIds.length > 0 && pageSelectableIds.every((id) => selectedBulk.has(id));

  const selectedBulkCount = selectedBulk.size;
  const CALLING_WA_SELECT_CAP = 100;

  const toggleBulkCustomer = (customer: CustomerWithHistory, checked: boolean) => {
    setSelectedBulk((prev) => {
      const next = new Map(prev);
      if (checked) next.set(customer.id, customer);
      else next.delete(customer.id);
      return next;
    });
  };

  const toggleSelectAllPage = (checked: boolean) => {
    setSelectedBulk((prev) => {
      const next = new Map(prev);
      for (const customer of pageRows) {
        if (String(customer.phone || '').replace(/\D/g, '').length < 10) continue;
        if (checked) next.set(customer.id, customer);
        else next.delete(customer.id);
      }
      return next;
    });
  };

  const openBulkWhatsApp = (queue = Array.from(selectedBulk.values())) => {
    const withPhone = queue.filter(
      (c) => String(c.phone || '').replace(/\D/g, '').length >= 10
    );
    if (!withPhone.length) {
      toast.error('Select at least one customer with a phone number');
      return;
    }
    setBulkQueue(withPhone);
    setBulkDialogOpen(true);
  };

  const selectMatchingFilters = async () => {
    if (totalCount === 0) {
      toast.info('No customers match these filters');
      return;
    }
    setSelectingMatching(true);
    try {
      const { data, error } = await db.calling.getPage({
        page: 1,
        limit: CALLING_WA_SELECT_CAP,
        search: debouncedSearch,
        serviceFilter,
        serviceHistoryFilter,
        serviceSubTypeFilter,
        showRecentlyContacted,
        recentContactDays,
        statusFilter,
        prefilterFilter,
      });
      if (error || !data) {
        throw error ?? new Error('Could not load matching customers');
      }
      const rows = (data.rows ?? []).map(mapCallingRowToCustomer);
      setSelectedBulk((prev) => {
        const next = new Map(prev);
        for (const customer of rows) {
          if (String(customer.phone || '').replace(/\D/g, '').length < 10) continue;
          next.set(customer.id, customer);
        }
        return next;
      });
      const withPhone = rows.filter(
        (c) => String(c.phone || '').replace(/\D/g, '').length >= 10
      ).length;
      if (data.total > CALLING_WA_SELECT_CAP) {
        toast.message(
          `Selected the first ${withPhone} matching customers (cap ${CALLING_WA_SELECT_CAP}). Narrow filters or tick more on later pages.`
        );
      } else {
        toast.success(`Selected ${withPhone} matching customer${withPhone === 1 ? '' : 's'}`);
      }
    } catch (err) {
      console.error('Select matching calling customers', err);
      toast.error('Could not select matching customers');
    } finally {
      setSelectingMatching(false);
    }
  };

  // Handle viewing photos
  const handleViewPhotos = async (customer: CustomerWithHistory) => {
    setSelectedCustomerForPhotos(customer);
    setCustomerPhotoGalleryOpen(true);
    // Always reload customer photos to get the latest data
    const customerId = customer.customer_id || customer.customerId;
    await loadCustomerPhotos(customerId);
  };

  // Load customer photos
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
      
      // Egress optimization: fetch only columns needed for photo extraction (avoid jobs.select('*')).
      const { data: jobs, error } = await supabase
        .from('jobs')
        .select('id, before_photos, after_photos, requirements, created_at')
        .eq('customer_id', customer.id)
        .order('created_at', { ascending: false });
      
      if (error) {
        throw error;
      }
      
      // Extract all photos from ALL jobs
      const photoSet = new Set<string>();
      
      const extractPhotoUrls = (photos: any[]): string[] => {
        if (!Array.isArray(photos)) return [];
        return photos.map(photo => {
          if (typeof photo === 'string' && photo.trim() !== '') {
            const trimmed = photo.trim();
            if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
              return trimmed;
            }
            return null;
          } else if (photo && typeof photo === 'object') {
            if (photo.secure_url && typeof photo.secure_url === 'string') {
              return photo.secure_url.trim();
            } else if (photo.url && typeof photo.url === 'string') {
              return photo.url.trim();
            }
          }
          return null;
        }).filter((url): url is string => {
          return url !== null && url !== '' && (url.startsWith('http://') || url.startsWith('https://'));
        });
      };
      
      if (jobs && jobs.length > 0) {
        jobs.forEach((job: any) => {
          const jobBeforePhotos = Array.isArray(job.before_photos || job.beforePhotos) 
            ? (job.before_photos || job.beforePhotos) 
            : [];
          extractPhotoUrls(jobBeforePhotos).forEach(url => photoSet.add(url));
          
          const jobAfterPhotos = Array.isArray(job.after_photos || job.afterPhotos) 
            ? (job.after_photos || job.afterPhotos) 
            : [];
          extractPhotoUrls(jobAfterPhotos).forEach(url => photoSet.add(url));
          
          if (job.requirements) {
            try {
              const requirements = typeof job.requirements === 'string' 
                ? JSON.parse(job.requirements) 
                : job.requirements;
              
              if (Array.isArray(requirements)) {
                requirements.forEach((req: any) => {
                  if (req.bill_photos && Array.isArray(req.bill_photos)) {
                    extractPhotoUrls(req.bill_photos).forEach(url => photoSet.add(url));
                  }
                  if (req.payment_photos && Array.isArray(req.payment_photos)) {
                    extractPhotoUrls(req.payment_photos).forEach(url => photoSet.add(url));
                  }
                });
              } else if (typeof requirements === 'object' && requirements !== null) {
                if (requirements.bill_photos && Array.isArray(requirements.bill_photos)) {
                  extractPhotoUrls(requirements.bill_photos).forEach(url => photoSet.add(url));
                }
                if (requirements.payment_photos && Array.isArray(requirements.payment_photos)) {
                  extractPhotoUrls(requirements.payment_photos).forEach(url => photoSet.add(url));
                }
              }
            } catch (e) {
              console.error('Error parsing requirements:', e);
            }
          }
        });
      }
      
      const uniquePhotos = Array.from(photoSet);
      setCustomerPhotos(uniquePhotos);
    } catch (error) {
      console.error('Error loading customer photos:', error);
      toast.error('Failed to load photos');
      setCustomerPhotos([]);
    } finally {
      setIsLoadingPhotos(false);
    }
  };


  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  /** Format days as "3 months 10 days" (< 12 months) or "1 year 2 months" (>= 12 months) */
  const formatDaysAgo = (days: number): string => {
    if (days < 30) {
      return days === 1 ? '1 day' : `${days} days`;
    }
    if (days < 365) {
      const months = Math.floor(days / 30);
      const rem = days % 30;
      const m = months === 1 ? 'month' : 'months';
      if (rem === 0) return `${months} ${m}`;
      const d = rem === 1 ? 'day' : 'days';
      return `${months} ${m} ${rem} ${d}`;
    }
    const years = Math.floor(days / 365);
    const rem = days % 365;
    const months = Math.floor(rem / 30);
    const y = years === 1 ? 'year' : 'years';
    if (months === 0) return `${years} ${y}`;
    const m = months === 1 ? 'month' : 'months';
    return `${years} ${y} ${months} ${m}`;
  };

  const formatShortDate = (dateString?: string) => {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
    });
  };

  /** Compact duration for narrow screens (e.g. 6mo 18d). */
  const formatDaysAgoCompact = (days: number): string => {
    if (days === 0) return 'today';
    if (days < 30) return `${days}d`;
    if (days < 365) {
      const months = Math.floor(days / 30);
      const rem = days % 30;
      return rem === 0 ? `${months}mo` : `${months}mo ${rem}d`;
    }
    const years = Math.floor(days / 365);
    const months = Math.floor((days % 365) / 30);
    return months === 0 ? `${years}y` : `${years}y ${months}mo`;
  };

  const renderTouchHistoryMeta = (
    dateString?: string,
    status?: string | null,
    emptyLabel = 'Never'
  ) => {
    if (!dateString) {
      return <span className="text-muted-foreground">{emptyLabel}</span>;
    }
    return (
      <span className="inline-flex items-center justify-end gap-1 min-w-0 max-w-[62%] sm:max-w-none">
        <span className="font-medium text-foreground truncate">
          <span className="sm:hidden">{formatShortDate(dateString)}</span>
          <span className="hidden sm:inline">{formatDate(dateString)}</span>
        </span>
        {status ? getStatusBadge(status, true) : null}
      </span>
    );
  };

  const getServiceBadgeColor = (days?: number | null) => {
    if (!days) return 'bg-muted/400';
    if (days < 90) return 'bg-green-500';
    if (days < 180) return 'bg-yellow-500';
    if (days < 365) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const getStatusBadge = (status?: string | null, compact = false) => {
    if (!status) return null;

    const normalized = normalizeCallHistoryStatus(status);
    const statusConfig: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
      'COMPLETED': { label: 'Sent', className: 'bg-green-100 text-green-800', icon: <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" /> },
      'NO_ANSWER': { label: 'No answer', className: 'bg-yellow-100 text-yellow-800', icon: <XCircle className="w-2.5 h-2.5 mr-0.5" /> },
      'BUSY': { label: 'Busy', className: 'bg-orange-100 text-orange-800', icon: <Phone className="w-2.5 h-2.5 mr-0.5" /> },
      'FAILED': { label: 'Failed', className: 'bg-red-100 text-red-800', icon: <XCircle className="w-2.5 h-2.5 mr-0.5" /> },
    };

    const config = statusConfig[normalized] || { label: status, className: 'bg-gray-100 text-foreground', icon: null };

    if (compact) {
      return (
        <span className={`inline-flex shrink-0 items-center rounded px-1 py-0 text-[9px] font-medium leading-tight whitespace-nowrap ${config.className}`}>
          {config.label}
        </span>
      );
    }
    
    return (
      <Badge className={config.className}>
        {config.icon}
        {config.label}
      </Badge>
    );
  };

  const getStatusOptions = (contactType: 'CALL' | 'WHATSAPP' | 'SMS' | 'EMAIL') => {
    if (contactType === 'CALL') {
      return [
        { value: 'COMPLETED', label: 'Answered' },
        { value: 'NO_ANSWER', label: 'No Answer' },
        { value: 'BUSY', label: 'Busy' },
        { value: 'FAILED', label: 'Failed' },
      ];
    }
    return [
      { value: 'COMPLETED', label: 'Sent' },
      { value: 'FAILED', label: 'Failed' },
    ];
  };

  const callingTotalPages = Math.max(1, Math.ceil(totalCount / itemsPerPage));
  const initialLoading = listLoading && pageRows.length === 0;

  // Show loading while checking auth or loading first page
  if (authInitializing || initialLoading) {
    return (
      <div className="min-h-screen bg-muted/40 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-3"></div>
          <p className="text-muted-foreground">
            {authInitializing
              ? 'Checking authentication...'
              : !serverPaginated && fallbackLoadProgress > 0
                ? `Loading all customers… ${fallbackLoadProgress.toLocaleString()} loaded`
                : 'Loading customers...'}
          </p>
        </div>
      </div>
    );
  }

  // Show access denied if not admin (only if standalone page)
  if (!hideHeader && (!user || !isAdmin)) {
    return (
      <div className="min-h-screen bg-muted/40 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6">
          <Lock className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-foreground mb-2">Access Denied</h2>
          <p className="text-muted-foreground mb-4">
            This page is restricted to administrators only. Please log in with an admin account to access this feature.
          </p>
          <Button onClick={() => navigate('/admin')} className="">
            Go to Admin Login
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/40">
      {/* Header - only show if not embedded */}
      {!hideHeader && (
        <div className="bg-card border-b border-border">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 py-4 sm:py-0 sm:h-16">
              <div className="flex items-center">
                <Phone className="w-6 h-6 sm:w-8 sm:h-8 text-blue-600 mr-2 sm:mr-3 shrink-0" />
                <div>
                  <h1 className="text-lg sm:text-xl font-bold text-foreground">Customer Calling & Messaging</h1>
                  <p className="text-xs sm:text-sm text-muted-foreground">Contact customers for service reminders</p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onBack || (() => navigate('/admin'))}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="w-4 h-4 mr-1" />
                  Back to Home
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-6 lg:py-8 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {/* Filters — collapsible on mobile */}
        <Card className="mb-3 sm:mb-6 rounded-xl overflow-hidden">
          <Collapsible open={filtersOpen || isMdUp} onOpenChange={setFiltersOpen}>
            <div className="flex items-center justify-between gap-2 p-3 sm:px-6 sm:pt-6 sm:pb-0 border-b border-border/50 md:border-0">
              <CollapsibleTrigger asChild className="md:pointer-events-none md:flex-1">
                <button
                  type="button"
                  className="flex flex-1 items-center gap-2 text-left min-h-[44px] touch-manipulation md:cursor-default"
                >
                  <Filter className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground shrink-0" />
                  <span className="font-semibold text-sm sm:text-base">Filters</span>
                  {activeFilterCount > 0 && (
                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-semibold">
                      {activeFilterCount}
                    </Badge>
                  )}
                  <ChevronDown
                    className={cn(
                      'w-4 h-4 ml-auto text-muted-foreground transition-transform md:hidden',
                      (filtersOpen || isMdUp) && 'rotate-180'
                    )}
                  />
                </button>
              </CollapsibleTrigger>
              {activeFilterCount > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9 text-xs shrink-0 md:hidden"
                  onClick={() => {
                    setSearchTerm('');
                    setServiceFilter('all');
                    setServiceHistoryFilter('all');
                    setServiceSubTypeFilter('all');
                    setShowRecentlyContacted(false);
                    setStatusFilter('all');
                    setPrefilterFilter('all');
                  }}
                >
                  Clear
                </Button>
              )}
            </div>
            <CollapsibleContent className="md:block">
              <CardContent className="pt-3 sm:pt-4 pb-4 sm:pb-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <div>
                <Label htmlFor="search">Search</Label>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground/70" />
                  <Input
                    id="search"
                    placeholder="Search by name, phone, ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="serviceFilter">Last Service</Label>
                <Select value={serviceFilter} onValueChange={setServiceFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Customers</SelectItem>
                    <SelectItem value="3months">3-6 Months Ago</SelectItem>
                    <SelectItem value="6months">6-12 Months Ago</SelectItem>
                    <SelectItem value="1year">1+ Year Ago</SelectItem>
                    <SelectItem value="never">Never Serviced</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="serviceHistoryFilter">Service History</Label>
                <Select value={serviceHistoryFilter} onValueChange={setServiceHistoryFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Customers</SelectItem>
                    <SelectItem value="serviced">Customers we have serviced</SelectItem>
                    <SelectItem value="never">Never serviced (no completed job)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="serviceSubTypeFilter">Last Job Type</Label>
                <Select value={serviceSubTypeFilter} onValueChange={setServiceSubTypeFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="Service">Service</SelectItem>
                    <SelectItem value="Installation">Installation</SelectItem>
                    <SelectItem value="Reinstallation">Reinstallation</SelectItem>
                    <SelectItem value="Return Complaint">Return Complaint</SelectItem>
                    <SelectItem value="Return Service">Return Service</SelectItem>
                    <SelectItem value="AMC Service">AMC Service</SelectItem>
                    <SelectItem value="New Purifier Installation">New Purifier Installation</SelectItem>
                    <SelectItem value="New Softener Installation">New Softener Installation</SelectItem>
                    <SelectItem value="Un-Installation">Un-Installation</SelectItem>
                    <SelectItem value="Repair">Repair</SelectItem>
                    <SelectItem value="Maintenance">Maintenance</SelectItem>
                    <SelectItem value="Replacement">Replacement</SelectItem>
                    <SelectItem value="Inspection">Inspection</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="recentContact">Show Recently Contacted</Label>
                <Select 
                  value={showRecentlyContacted ? 'show' : 'hide'} 
                  onValueChange={(value) => setShowRecentlyContacted(value === 'show')}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hide">Hide (Skip if contacted within {recentContactDays} days)</SelectItem>
                    <SelectItem value="show">Show All</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="recentDays">Recent Contact Days</Label>
                <Input
                  id="recentDays"
                  type="number"
                  value={recentContactDays}
                  onChange={(e) => setRecentContactDays(parseInt(e.target.value) || 7)}
                  min="1"
                  max="30"
                />
              </div>

              <div>
                <Label htmlFor="statusFilter">Contact Status</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="never">Never Contacted</SelectItem>
                    <SelectItem value="COMPLETED">Completed / Sent</SelectItem>
                    <SelectItem value="NO_ANSWER">No Answer</SelectItem>
                    <SelectItem value="BUSY">Busy</SelectItem>
                    <SelectItem value="FAILED">Failed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="prefilterFilter">Prefilter</Label>
                <Select value={prefilterFilter} onValueChange={setPrefilterFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="yes">Has Prefilter</SelectItem>
                    <SelectItem value="no">No Prefilter</SelectItem>
                    <SelectItem value="unknown">Unknown</SelectItem>
                  </SelectContent>
                </Select>
              </div>

            </div>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        {/* Stats — single strip on mobile, cards on desktop */}
        <Card className="rounded-xl overflow-hidden mb-3 sm:mb-6 md:hidden">
          <CardContent className="p-0 flex divide-x divide-border">
            <div className="flex-1 min-w-0 px-2 py-3 text-center">
              <div className="text-base font-bold tabular-nums truncate">{totalCount.toLocaleString()}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">To contact</div>
            </div>
            <div className="flex-1 min-w-0 px-2 py-3 text-center">
              <div className="text-base font-bold text-green-600 tabular-nums">{stats.overOneYear.toLocaleString()}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">1+ year</div>
            </div>
            <div className="flex-1 min-w-0 px-2 py-3 text-center">
              <div className="text-base font-bold text-orange-600 tabular-nums">{stats.sixToTwelve.toLocaleString()}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">6–12 mo</div>
            </div>
          </CardContent>
        </Card>
        <div className="hidden md:grid md:grid-cols-3 gap-4 mb-6">
          <Card className="rounded-xl">
            <CardContent className="p-3 sm:p-4">
              <div className="text-lg sm:text-2xl font-bold text-foreground tabular-nums">{totalCount.toLocaleString()}</div>
              <div className="text-[11px] sm:text-sm text-muted-foreground leading-tight mt-0.5">To contact</div>
            </CardContent>
          </Card>
          <Card className="rounded-xl">
            <CardContent className="p-3 sm:p-4">
              <div className="text-lg sm:text-2xl font-bold text-green-600 tabular-nums">
                {stats.overOneYear.toLocaleString()}
              </div>
              <div className="text-[11px] sm:text-sm text-muted-foreground leading-tight mt-0.5">Over 1 year</div>
            </CardContent>
          </Card>
          <Card className="rounded-xl">
            <CardContent className="p-3 sm:p-4">
              <div className="text-lg sm:text-2xl font-bold text-orange-600 tabular-nums">
                {stats.sixToTwelve.toLocaleString()}
              </div>
              <div className="text-[11px] sm:text-sm text-muted-foreground leading-tight mt-0.5">6–12 months</div>
            </CardContent>
          </Card>
        </div>

        {/* Customer List */}
        <div className="space-y-2 sm:space-y-3">
          {totalCount === 0 && !listLoading ? (
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-muted-foreground">No customers found matching your filters.</p>
                <p className="text-sm text-muted-foreground/70 mt-2">Try setting Service History to &quot;All Customers&quot;.</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Results toolbar — sticky on mobile */}
              <div className="sticky top-0 z-10 -mx-3 px-3 py-2 mb-2 sm:static sm:mx-0 sm:px-0 sm:py-0 sm:mb-4 bg-muted/80 backdrop-blur-md sm:bg-transparent sm:backdrop-blur-none border-b border-border/40 sm:border-0">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="text-[11px] sm:text-sm text-muted-foreground leading-tight min-w-0">
                    <span className="font-medium text-foreground tabular-nums">
                      {totalCount === 0 ? 0 : ((currentPage - 1) * itemsPerPage) + 1}–{Math.min(currentPage * itemsPerPage, totalCount)}
                    </span>
                    <span className="hidden sm:inline"> of {totalCount.toLocaleString()}</span>
                    <span className="sm:hidden"> / {totalCount.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                    {listLoading && (
                      <div className="w-3.5 h-3.5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                    )}
                    <label className="inline-flex items-center gap-1.5 text-[11px] sm:text-xs text-muted-foreground cursor-pointer select-none">
                      <Checkbox
                        checked={allPageSelected}
                        onCheckedChange={(v) => toggleSelectAllPage(v === true)}
                        disabled={pageSelectableIds.length === 0}
                        aria-label="Select all on this page"
                      />
                      <span className="hidden sm:inline">This page</span>
                      <span className="sm:hidden">Page</span>
                    </label>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      disabled={listLoading || selectingMatching || totalCount === 0}
                      onClick={() => void selectMatchingFilters()}
                    >
                      {selectingMatching ? (
                        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      ) : null}
                      <span className="hidden sm:inline">
                        Select matching
                        {totalCount > CALLING_WA_SELECT_CAP ? ` (${CALLING_WA_SELECT_CAP})` : ''}
                      </span>
                      <span className="sm:hidden">Match</span>
                    </Button>
                    {selectedBulkCount > 0 ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 text-xs"
                        onClick={() => setSelectedBulk(new Map())}
                      >
                        Clear
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      disabled={selectedBulkCount === 0}
                      onClick={() => openBulkWhatsApp()}
                    >
                      <Users className="w-3.5 h-3.5 mr-1.5" />
                      Bulk WA
                      {selectedBulkCount > 0 ? ` (${selectedBulkCount})` : ''}
                    </Button>
                    <Select value={itemsPerPage.toString()} onValueChange={(value) => {
                      setItemsPerPage(parseInt(value));
                      setCurrentPage(1);
                    }}>
                      <SelectTrigger id="itemsPerPage" className="w-[4.25rem] h-8 text-xs sm:h-9 sm:text-sm sm:w-[4.5rem]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="20">20</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {selectedBulkCount > 0 ? (
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    {selectedBulkCount} selected for WhatsApp. Ticks stay when you change page.
                    {totalCount > itemsPerPage
                      ? ' Use Match to take the first 100 of this filter, or tick more on other pages.'
                      : ''}
                  </p>
                ) : (
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    Tick customers, or Match this filter, then Bulk WA. One customer: the green
                    WhatsApp button. Cold (no 24h chat): uses an approved Meta template.
                  </p>
                )}
              </div>

              {pageRows.map((customer) => {
                const serviceDays = customer.daysSinceService;
                const recentlyContacted =
                  customer.daysSinceContact != null &&
                  customer.daysSinceContact < recentContactDays;

                return (
              <Card
                key={customer.id}
                className="overflow-hidden border-border/60 shadow-none sm:shadow-sm rounded-xl"
              >
                <CardContent className="p-0">
                  {/* Header */}
                  <div className="flex items-center gap-2 px-3 pt-2.5 pb-2">
                    <Checkbox
                      checked={selectedBulk.has(customer.id)}
                      disabled={String(customer.phone || '').replace(/\D/g, '').length < 10}
                      onCheckedChange={(v) => toggleBulkCustomer(customer, v === true)}
                      aria-label={`Select ${customer.fullName}`}
                      className="shrink-0"
                    />
                    <span className="shrink-0 font-mono text-[10px] font-semibold text-blue-700 bg-blue-50/80 px-1.5 py-0.5 rounded">
                      {customer.customerId}
                    </span>
                    <h3
                      className={`flex-1 min-w-0 text-sm font-semibold leading-tight truncate ${
                        customerNameClassName(customer) || 'text-foreground'
                      }`}
                    >
                      {customer.fullName}
                    </h3>
                    {recentlyContacted && (
                      <span className="shrink-0 text-[10px] text-amber-700 font-medium">
                        {formatDaysAgo(customer.daysSinceContact!)} ago
                      </span>
                    )}
                  </div>

                  <div className="px-3 pb-2 space-y-1.5">
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 text-sm text-foreground py-1 touch-manipulation text-left"
                      onClick={() => handleCall(customer)}
                    >
                      <Phone className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span className="truncate font-medium">{customer.phone}</span>
                      {customer.alternatePhone && (
                        <span className="text-[11px] text-muted-foreground truncate hidden sm:inline">
                          / {customer.alternatePhone}
                        </span>
                      )}
                    </button>

                    {customer.email && (
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground min-w-0 pl-5 sm:pl-0">
                        <Mail className="w-3 h-3 shrink-0 sm:hidden" />
                        <span className="truncate">{customer.email}</span>
                      </div>
                    )}

                    {/* Compact meta strip — single line per row on mobile */}
                    <div className="rounded-lg border border-border/50 bg-muted/20 text-[11px] divide-y divide-border/40">
                      <div className="flex items-center justify-between gap-2 px-2.5 py-2">
                        <span className="text-muted-foreground flex items-center gap-1 shrink-0">
                          <Calendar className="w-3 h-3" />
                          Service
                        </span>
                        <span className="inline-flex items-center justify-end gap-1 min-w-0 max-w-[68%] sm:max-w-none">
                          <span className="font-medium text-foreground truncate whitespace-nowrap">
                            <span className="sm:hidden">{formatShortDate(customer.lastServiceDate)}</span>
                            <span className="hidden sm:inline">{formatDate(customer.lastServiceDate)}</span>
                          </span>
                          {serviceDays != null && (
                            <span
                              className={`shrink-0 rounded px-1 py-px text-[9px] font-medium text-white whitespace-nowrap ${getServiceBadgeColor(serviceDays)}`}
                            >
                              <span className="sm:hidden">{formatDaysAgoCompact(serviceDays)}</span>
                              <span className="hidden sm:inline">{formatDaysAgo(serviceDays)}</span>
                            </span>
                          )}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2 px-2.5 py-2">
                        <span className="text-muted-foreground flex items-center gap-1 shrink-0">
                          <Phone className="w-3 h-3 text-blue-600" />
                          Call
                        </span>
                        {renderTouchHistoryMeta(customer.lastContacted, customer.lastContactStatus)}
                      </div>

                      <div className="flex items-center justify-between gap-2 px-2.5 py-2">
                        <span className="text-muted-foreground flex items-center gap-1 shrink-0">
                          <WhatsAppIcon className="w-3 h-3 text-green-600" />
                          WhatsApp
                        </span>
                        {renderTouchHistoryMeta(customer.lastWhatsAppAt, customer.lastWhatsAppStatus, '—')}
                      </div>
                    </div>
                  </div>

                  {/* Actions — icon-only on mobile, labels on sm+ */}
                  <div className="grid grid-cols-4 gap-1.5 px-2.5 py-2 border-t border-border/40 bg-muted/10">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleCall(customer)}
                      className="h-9 px-0 touch-manipulation flex items-center justify-center rounded-lg text-blue-700 hover:bg-blue-50 hover:text-blue-800"
                      title="Call"
                    >
                      <Phone className="w-4 h-4 shrink-0" />
                      <span className="sr-only">Call</span>
                    </Button>
                    {cloudApiOn ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleWhatsApp(customer)}
                      className="h-9 px-0 touch-manipulation flex items-center justify-center rounded-lg text-green-700 hover:bg-green-50 hover:text-green-800"
                      title="WhatsApp"
                    >
                      <WhatsAppIcon className="w-4 h-4 shrink-0" />
                      <span className="sr-only">WhatsApp</span>
                    </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleViewPhotos(customer)}
                      disabled={isLoadingPhotos && selectedCustomerForPhotos?.id === customer.id}
                      className="h-9 px-0 touch-manipulation flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60"
                      title="Photos"
                    >
                      {isLoadingPhotos && selectedCustomerForPhotos?.id === customer.id ? (
                        <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin shrink-0" />
                      ) : (
                        <Camera className="w-4 h-4 shrink-0" />
                      )}
                      <span className="sr-only">Photos</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setSelectedCustomerForReport(customer);
                        setCustomerReportDialogOpen(true);
                      }}
                      className="h-9 px-0 touch-manipulation flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60"
                      title="Report"
                    >
                      <FileText className="w-4 h-4 shrink-0" />
                      <span className="sr-only">Report</span>
                    </Button>
                  </div>
                </CardContent>
              </Card>
                );
              })}

              {/* Pagination — compact, wraps on small screens (matches admin completed jobs) */}
              {callingTotalPages > 1 && (
                <div className="mt-6 w-full min-w-0 max-w-full px-1">
                  <div className="flex flex-col items-center gap-2">
                    <div className="flex flex-wrap items-center justify-center gap-2 w-full max-w-full">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9 shrink-0 touch-manipulation"
                        disabled={currentPage <= 1}
                        onClick={() => {
                          if (currentPage > 1) {
                            setCurrentPage(currentPage - 1);
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }
                        }}
                      >
                        <ArrowLeft className="h-4 w-4 sm:mr-1" />
                        <span className="hidden sm:inline">Previous</span>
                      </Button>
                      <span className="text-sm text-foreground/90 dark:text-gray-300 tabular-nums px-2 text-center min-w-[5.5rem]">
                        {currentPage} / {callingTotalPages}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9 shrink-0 touch-manipulation"
                        disabled={currentPage >= callingTotalPages}
                        onClick={() => {
                          if (currentPage < callingTotalPages) {
                            setCurrentPage(currentPage + 1);
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }
                        }}
                      >
                        <span className="hidden sm:inline">Next</span>
                        <ArrowRight className="h-4 w-4 sm:ml-1" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {selectedCustomerForWhatsApp && (
        <WhatsAppCustomizeSendDialog
          open={whatsappDialogOpen}
          onOpenChange={(open) => {
            setWhatsappDialogOpen(open);
            if (!open) setSelectedCustomerForWhatsApp(null);
          }}
          title="Calling — WhatsApp"
          customerName={selectedCustomerForWhatsApp.fullName || 'Customer'}
          customerId={selectedCustomerForWhatsApp.id}
          primaryPhone={selectedCustomerForWhatsApp.phone}
          alternatePhone={selectedCustomerForWhatsApp.alternatePhone}
          source="calling"
          messageContext={waMessageContext || undefined}
          onSent={async ({ phone, message }) => {
            await recordCall(
              selectedCustomerForWhatsApp.id,
              'WHATSAPP',
              phone,
              message,
              'COMPLETED',
              undefined,
              { quiet: true }
            );
          }}
        />
      )}

      <CallingBulkWhatsAppDialog
        open={bulkDialogOpen}
        onOpenChange={(open) => {
          setBulkDialogOpen(open);
          if (!open) setBulkQueue([]);
        }}
        customers={bulkQueue}
        onRecordSent={async (customerId, phone, message) => {
          await recordCall(customerId, 'WHATSAPP', phone, message, 'COMPLETED', undefined, {
            quiet: true,
          });
        }}
      />

      {/* Status Dialog */}
      <Dialog open={statusDialogOpen} onOpenChange={handleStatusDialogClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record Contact Status</DialogTitle>
            <DialogDescription>
              Please confirm the status of your contact attempt
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {pendingContact && (
              <>
                <div>
                  <Label>Contact Type</Label>
                  <p className="text-sm text-muted-foreground capitalize">{pendingContact.contactType.toLowerCase()}</p>
                </div>

                <div>
                  <Label htmlFor="contactStatus">Status *</Label>
                  <Select value={contactStatus} onValueChange={setContactStatus}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {getStatusOptions(pendingContact.contactType).map(option => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="contactNotes">Notes (Optional)</Label>
                  <Textarea
                    id="contactNotes"
                    value={contactNotes}
                    onChange={(e) => setContactNotes(e.target.value)}
                    placeholder="Add any notes about this contact..."
                    rows={3}
                  />
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleStatusDialogClose}>
              Cancel
            </Button>
            <Button onClick={handleStatusSubmit} className="">
              Save Status
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Customer Photo Gallery Dialog */}
      {selectedCustomerForPhotos && (
        <CustomerPhotoGalleryDialog
          open={customerPhotoGalleryOpen}
          onOpenChange={(open) => {
            setCustomerPhotoGalleryOpen(open);
            if (!open) {
              setSelectedCustomerForPhotos(null);
              setCustomerPhotos([]);
            }
          }}
          customer={selectedCustomerForPhotos}
          customerPhotos={{
            [selectedCustomerForPhotos.customer_id || selectedCustomerForPhotos.customerId || '']: customerPhotos
          }}
          uploadingThumbnails={{}}
          isUploadingPhoto={false}
          isLoadingPhotos={isLoadingPhotos}
          isDragOverPhotos={false}
          isCompressingImage={false}
          onPhotoUpload={() => {}}
          onCameraCapture={() => {}}
          onDragOver={() => {}}
          onDragLeave={() => {}}
          onDrop={() => {}}
          onPhotoClick={(photo, index, total) => {
            const list = customerPhotos.length > 0 ? customerPhotos : [photo];
            const safeIndex = Math.min(Math.max(0, index), list.length - 1);
            setReportSelectedBillPhotos(list);
            setReportSelectedPhoto({
              url: list[safeIndex] || photo,
              index: safeIndex,
              total: total || list.length,
            });
            setReportPhotoViewerOpen(true);
          }}
          onDeletePhoto={() => {
            // Disable delete in calling page
          }}
        />
      )}

      {/* Customer Report Dialog — suspend while photo viewer open for pinch/zoom */}
      {customerReportDialogOpen && (
        <CustomerReportDialog
          open={customerReportDialogOpen}
          photoViewerOpen={reportPhotoViewerOpen}
          customer={selectedCustomerForReport}
          technicians={technicians}
          onOpenChange={(open) => {
            if (!open && ignoreParentDismissWhileSuspended()) return;
            setCustomerReportDialogOpen(open);
            if (!open) {
              setSelectedCustomerForReport(null);
              setReportPhotoViewerOpen(false);
            }
          }}
          onPhotoClick={(url, index, total, photos) => {
            const list = photos && photos.length > 0 ? photos : [url];
            const safeIndex = Math.min(Math.max(0, index), list.length - 1);
            openSuspendedViewer(
              () => setCustomerReportDialogOpen(false),
              () => {
                setReportSelectedBillPhotos(list);
                setReportSelectedPhoto({
                  url: list[safeIndex] || url,
                  index: safeIndex,
                  total: list.length || total,
                });
                setReportPhotoViewerOpen(true);
              }
            );
          }}
          onBillPhotosClick={(photos, index) => {
            if (!photos.length) return;
            const safeIndex = Math.min(Math.max(0, index), photos.length - 1);
            openSuspendedViewer(
              () => setCustomerReportDialogOpen(false),
              () => {
                setReportSelectedBillPhotos(photos);
                setReportSelectedPhoto({
                  url: photos[safeIndex],
                  index: safeIndex,
                  total: photos.length,
                });
                setReportPhotoViewerOpen(true);
              }
            );
          }}
        />
      )}

      {/* Photo viewer for report images (payment/bill click-to-view) */}
      {reportPhotoViewerOpen && (
        <PhotoViewerDialog
          open={reportPhotoViewerOpen}
          onOpenChange={(open) => {
            if (open) {
              setReportPhotoViewerOpen(true);
              return;
            }
            closeSuspendedViewer(
              () => setCustomerReportDialogOpen(true),
              () => {
                setReportPhotoViewerOpen(false);
                setReportSelectedPhoto(null);
                setReportSelectedBillPhotos(null);
              }
            );
          }}
          selectedPhoto={reportSelectedPhoto}
          selectedBillPhotos={reportSelectedBillPhotos}
          selectedJobPhotos={null}
          showNavigation={Boolean(reportSelectedBillPhotos && reportSelectedBillPhotos.length > 1)}
          onPrevious={() => {
            if (!reportSelectedPhoto || !reportSelectedBillPhotos || reportSelectedBillPhotos.length <= 1) return;
            const newIndex = reportSelectedPhoto.index > 0 ? reportSelectedPhoto.index - 1 : reportSelectedBillPhotos.length - 1;
            setReportSelectedPhoto({
              url: reportSelectedBillPhotos[newIndex],
              index: newIndex,
              total: reportSelectedBillPhotos.length
            });
          }}
          onNext={() => {
            if (!reportSelectedPhoto || !reportSelectedBillPhotos || reportSelectedBillPhotos.length <= 1) return;
            const newIndex = reportSelectedPhoto.index < reportSelectedBillPhotos.length - 1 ? reportSelectedPhoto.index + 1 : 0;
            setReportSelectedPhoto({
              url: reportSelectedBillPhotos[newIndex],
              index: newIndex,
              total: reportSelectedBillPhotos.length
            });
          }}
          onDownload={(photoUrl, photoIndex) => {
            const link = document.createElement('a');
            link.href = photoUrl;
            link.download = `photo-${photoIndex + 1}.jpg`;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.click();
          }}
          onClose={() => {
            closeSuspendedViewer(
              () => setCustomerReportDialogOpen(true),
              () => {
                setReportPhotoViewerOpen(false);
                setReportSelectedPhoto(null);
                setReportSelectedBillPhotos(null);
              }
            );
          }}
        />
      )}
    </div>
  );
};

export default CallingPage;

