import React, { useState, useEffect } from 'react';
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
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { 
  Phone, 
  MessageCircle, 
  ArrowLeft, 
  Search, 
  Filter,
  Calendar,
  User,
  Mail,
  CheckCircle2,
  XCircle,
  Clock,
  Edit,
  Lock,
  Camera,
  FileText
} from 'lucide-react';

// WhatsApp Icon Component
const WhatsAppIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488"/>
  </svg>
);
import { toast } from 'sonner';
import { db, supabase } from '@/lib/supabase';
import { Customer } from '@/types';
import { formatPhoneForWhatsApp, normalizePhoneForSearch } from '@/lib/utils';
import { customerNameClassName } from '@/lib/customerDisplay';
import CustomerPhotoGalleryDialog from '@/components/admin/CustomerPhotoGalleryDialog';
import CustomerReportDialog from '@/components/admin/CustomerReportDialog';
import PhotoViewerDialog from '@/components/admin/PhotoViewerDialog';

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
  hasPrefilter?: boolean | null;
  rawWaterTds?: number;
  callHistory?: CallHistory[];
}

interface CallingPageProps {
  hideHeader?: boolean;
  onBack?: () => void;
}

const CallingPage = ({ hideHeader = false, onBack }: CallingPageProps = {}) => {
  const navigate = useNavigate();
  const { user, isAdmin, loading: authLoading } = useAuth();
  const [customers, setCustomers] = useState<CustomerWithHistory[]>([]);
  const [filteredCustomers, setFilteredCustomers] = useState<CustomerWithHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [serviceFilter, setServiceFilter] = useState<string>('all');
  const [serviceHistoryFilter, setServiceHistoryFilter] = useState<string>('all'); // 'all', 'serviced', 'never'
  const [serviceSubTypeFilter, setServiceSubTypeFilter] = useState<string>('all'); // 'all', specific last service_sub_type
  const [showRecentlyContacted, setShowRecentlyContacted] = useState(false);
  const [recentContactDays, setRecentContactDays] = useState(7); // Don't show if contacted within 7 days
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [prefilterFilter, setPrefilterFilter] = useState<string>('all'); // 'all', 'yes', 'no', 'unknown'
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
  const [paginatedCustomers, setPaginatedCustomers] = useState<CustomerWithHistory[]>([]);
  const [whatsappDialogOpen, setWhatsappDialogOpen] = useState(false);
  const [selectedCustomerForWhatsApp, setSelectedCustomerForWhatsApp] = useState<CustomerWithHistory | null>(null);
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

  // Redirect to admin login if not authenticated or not admin (only if standalone page)
  useEffect(() => {
    if (!hideHeader && !authLoading) {
      if (!user || !isAdmin) {
        toast.error('Access denied. Admin authentication required.');
        navigate('/admin');
      }
    }
  }, [user, isAdmin, authLoading, navigate, hideHeader]);

  useEffect(() => {
    loadCustomers();
  }, []);

  // Lazy-load technicians only when report dialog is opened (saves one DB round-trip on page load)
  useEffect(() => {
    if (!customerReportDialogOpen || technicians.length > 0) return;
    const loadTechnicians = async () => {
      const { data, error } = await db.technicians.getList(100);
      if (!error && data) setTechnicians(data);
    };
    loadTechnicians();
  }, [customerReportDialogOpen]);

  useEffect(() => {
    filterCustomers();
  }, [
    customers,
    searchTerm,
    serviceFilter,
    serviceHistoryFilter,
    serviceSubTypeFilter,
    showRecentlyContacted,
    recentContactDays,
    statusFilter,
    prefilterFilter,
  ]);

  useEffect(() => {
    // Reset to page 1 when filters change
    setCurrentPage(1);
  }, [
    searchTerm,
    serviceFilter,
    serviceHistoryFilter,
    serviceSubTypeFilter,
    showRecentlyContacted,
    statusFilter,
    prefilterFilter,
  ]);

  useEffect(() => {
    // Calculate paginated customers
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    setPaginatedCustomers(filteredCustomers.slice(startIndex, endIndex));
  }, [filteredCustomers, currentPage, itemsPerPage]);

  const loadCustomers = async () => {
    try {
      setLoading(true);
      
      // Slim select: no address/location (large JSONB) – report dialog doesn't use them
      const { data: customersData, error: customersError } = await supabase
        .from('customers')
        .select(`
          id,
          customer_id,
          full_name,
          customer_tier,
          phone,
          alternate_phone,
          email,
          service_type,
          brand,
          model,
          status,
          has_prefilter,
          last_service_date
        `)
        // Cap customers pulled from DB to avoid full-table egress.
        // Client still paginates using `currentPage/itemsPerPage`.
        .order('created_at', { ascending: false })
        .limit(1000);

      if (customersError) throw customersError;

      // Prefer RPCs (one row per customer) to cut egress; fallback to full table fetch if RPCs missing
      type JobRow = { customer_id: string; completed_at: string; service_type?: string | null; service_sub_type?: string | null };
      type ContactRow = { customer_id: string; contacted_at: string; status: string };
      let lastJobsData: JobRow[] | null = null;
      let lastContactsData: ContactRow[] | null = null;

      const [jobsRes, contactsRes] = await Promise.all([
        supabase.rpc('get_last_completed_job_per_customer') as Promise<{ data: JobRow[] | null; error: unknown }>,
        supabase.rpc('get_last_contact_per_customer') as Promise<{ data: ContactRow[] | null; error: unknown }>
      ]);

      if (jobsRes.error) {
        const fallback = await supabase
          .from('jobs')
          .select('customer_id, completed_at, service_type, service_sub_type')
          .eq('status', 'COMPLETED')
          .not('completed_at', 'is', null)
          .order('completed_at', { ascending: false })
          .limit(2000);
        lastJobsData = fallback.data;
      } else {
        lastJobsData = jobsRes.data;
      }
      if (contactsRes.error) {
        const fallback = await supabase
          .from('call_history')
          .select('customer_id, contacted_at, status')
          .order('contacted_at', { ascending: false })
          .limit(2000);
        lastContactsData = fallback.data;
      } else {
        lastContactsData = contactsRes.data;
      }

      const lastServiceMap = new Map<string, { completed_at: string; service_type?: string | null; service_sub_type?: string | null }>();
      (lastJobsData || []).forEach((job: any) => {
        if (job.customer_id && !lastServiceMap.has(job.customer_id)) {
          lastServiceMap.set(job.customer_id, {
            completed_at: job.completed_at,
            service_type: job.service_type ?? null,
            service_sub_type: job.service_sub_type ?? null,
          });
        }
      });

      const lastContactMap = new Map<string, { contacted_at: string; status: string }>();
      (lastContactsData || []).forEach((contact: any) => {
        if (contact.customer_id && !lastContactMap.has(contact.customer_id)) {
          lastContactMap.set(contact.customer_id, {
            contacted_at: contact.contacted_at,
            status: contact.status
          });
        }
      });

      // Process customers efficiently
      const now = new Date().getTime();
      const customersWithHistory: CustomerWithHistory[] = (customersData || []).map((customer: any) => {
        const lastJobInfo = lastServiceMap.get(customer.id);
        const lastServiceDate = lastJobInfo?.completed_at || customer.last_service_date;
        const lastContact = lastContactMap.get(customer.id);
        
        const daysSinceService = lastServiceDate 
          ? Math.floor((now - new Date(lastServiceDate).getTime()) / (1000 * 60 * 60 * 24))
          : null;

        const daysSinceContact = lastContact
          ? Math.floor((now - new Date(lastContact.contacted_at).getTime()) / (1000 * 60 * 60 * 24))
          : null;

        return {
          ...customer,
          id: customer.id,
          customerId: customer.customer_id,
          fullName: customer.full_name,
          phone: customer.phone,
          alternatePhone: customer.alternate_phone,
          email: customer.email,
          address: customer.address ?? { street: '', area: '', city: '', state: '', pincode: '' },
          location: customer.location ?? { latitude: 0, longitude: 0, formattedAddress: '' },
          serviceType: customer.service_type,
          brand: customer.brand,
          model: customer.model,
          status: customer.status,
          hasPrefilter: customer.has_prefilter ?? null,
          rawWaterTds: (customer as any).raw_water_tds ?? 0,
          lastServiceDate,
          daysSinceService,
          lastServiceSubType: lastJobInfo?.service_sub_type || null,
          lastServiceType: lastJobInfo?.service_type || null,
          lastContacted: lastContact?.contacted_at || null,
          daysSinceContact,
          lastContactStatus: lastContact?.status || null,
          callHistory: [] // Not needed for display, only last contact matters
        };
      });

      setCustomers(customersWithHistory);
    } catch (error) {
      console.error('Error loading customers:', error);
      toast.error('Failed to load customers');
    } finally {
      setLoading(false);
    }
  };

  const filterCustomers = () => {
    let filtered = [...customers];

    // Filter by search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const normSearch = normalizePhoneForSearch(searchTerm);
      const isPhoneSearch = normSearch.length >= 10;
      filtered = filtered.filter(customer => {
        const phoneMatch = isPhoneSearch && (
          normalizePhoneForSearch(customer.phone) === normSearch ||
          normalizePhoneForSearch((customer as any).alternatePhone ?? (customer as any).alternate_phone) === normSearch
        );
        return (
          customer.fullName?.toLowerCase().includes(term) ||
          customer.phone?.includes(searchTerm) ||
          (customer as any).alternatePhone?.includes(searchTerm) ||
          (customer as any).alternate_phone?.includes(searchTerm) ||
          customer.customerId?.toLowerCase().includes(term) ||
          customer.email?.toLowerCase().includes(term) ||
          phoneMatch
        );
      });
    }

    // Filter by service date window (how long since last service)
    if (serviceFilter !== 'all') {
      const now = new Date();
      filtered = filtered.filter(customer => {
        if (!customer.lastServiceDate) return false;
        
        const serviceDate = new Date(customer.lastServiceDate);
        const daysDiff = Math.floor((now.getTime() - serviceDate.getTime()) / (1000 * 60 * 60 * 24));
        
        switch (serviceFilter) {
          case '3months':
            return daysDiff >= 90 && daysDiff < 180;
          case '6months':
            return daysDiff >= 180 && daysDiff < 365;
          case '1year':
            return daysDiff >= 365;
          case 'never':
            return !customer.lastServiceDate;
          default:
            return true;
        }
      });
    }

    // Filter by basic service history (ever serviced vs never)
    if (serviceHistoryFilter !== 'all') {
      filtered = filtered.filter(customer => {
        const hasService = !!customer.lastServiceDate;
        if (serviceHistoryFilter === 'serviced') {
          return hasService;
        }
        if (serviceHistoryFilter === 'never') {
          return !hasService;
        }
        return true;
      });
    }

    // Filter by last service sub type (Installation / Reinstallation / Service, etc.)
    if (serviceSubTypeFilter !== 'all') {
      filtered = filtered.filter(customer => {
        const subType = (customer.lastServiceSubType || '').toUpperCase();
        if (!subType) return false;
        return subType === serviceSubTypeFilter.toUpperCase();
      });
    }

    // Filter out recently contacted customers
    if (!showRecentlyContacted) {
      filtered = filtered.filter(customer => {
        if (!customer.lastContacted) return true; // Never contacted, show them
        const daysSinceContact = customer.daysSinceContact || 0;
        return daysSinceContact >= recentContactDays;
      });
    }

    // Filter by contact status
    if (statusFilter !== 'all') {
      filtered = filtered.filter(customer => {
        if (!customer.lastContactStatus) {
          return statusFilter === 'never';
        }
        return customer.lastContactStatus === statusFilter;
      });
    }

    // Filter by prefilter
    if (prefilterFilter !== 'all') {
      filtered = filtered.filter(customer => {
        if (prefilterFilter === 'yes') {
          return customer.hasPrefilter === true;
        } else if (prefilterFilter === 'no') {
          return customer.hasPrefilter === false;
        } else if (prefilterFilter === 'unknown') {
          return customer.hasPrefilter === null || customer.hasPrefilter === undefined;
        }
        return true;
      });
    }

    // Sort by days since last service: oldest service first (customers not yet serviced go last)
    filtered.sort((a, b) => {
      const aDays = a.daysSinceService != null ? a.daysSinceService : -1;
      const bDays = b.daysSinceService != null ? b.daysSinceService : -1;
      return bDays - aDays;
    });

    setFilteredCustomers(filtered);
  };

  const recordCall = async (customerId: string, contactType: 'CALL' | 'WHATSAPP' | 'SMS' | 'EMAIL', phoneNumber?: string, message?: string, status?: string, notes?: string) => {
    try {
      const { error } = await db.callHistory.create({
        customer_id: customerId,
        contact_type: contactType,
        phone_number: phoneNumber,
        message_sent: message,
        status: status || 'COMPLETED',
        notes: notes
      });

      if (error) throw error;

      // Optimistic update: avoid full reload (saves egress and DB load)
      const now = new Date().toISOString();
      setCustomers(prev => prev.map(c =>
        c.id === customerId
          ? { ...c, lastContacted: now, daysSinceContact: 0, lastContactStatus: status || 'COMPLETED' }
          : c
      ));
      toast.success('Call/message recorded');
    } catch (error) {
      console.error('Error recording call:', error);
      toast.error('Failed to record call');
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
    setStatusDialogOpen(true);
    setContactStatus('COMPLETED');
    setContactNotes('');
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

  const generateWhatsAppMessage = (customer: CustomerWithHistory, template: string): string => {
    const daysSinceService = customer.daysSinceService;
    
    switch (template) {
      case 'service_due': {
        let message = `Hi ${customer.fullName},\n\n`;
        if (daysSinceService != null && daysSinceService > 0) {
          message += `We noticed it's been ${formatDaysAgo(daysSinceService)} since your last RO service.\n\n`;
        }
        message += `Your RO water purifier service is due. We're here to help maintain your RO in top condition.\n\n`;
        message += `Would you like to schedule a service? Please reply to this message or call us at 8884944288.\n\n`;
        message += `Thank you!\nHydrogen RO Team`;
        return message;
      }

      case 'contact':
        return `Hi ${customer.fullName},\n\nThis is Hydrogen RO. We wanted to reach out and check if you need any assistance with your RO water purifier.\n\nIf you have any questions or need service, please reply to this message or call us at:\n📞 8884944288\n📞 9886944288\n\nWe're here to help!\nHydrogen RO Team`;

      case 'website':
        return `Hi ${customer.fullName},\n\nThank you for being our valued customer!\n\nVisit our website for more information:\n🌐 hydrogenro.com\n\nFor service bookings, inquiries, or support:\n📞 Call: 8884944288 / 9886944288\n💬 WhatsApp: Reply to this message\n\nBest regards,\nHydrogen RO Team`;

      case 'maintenance_reminder':
        return `Hi ${customer.fullName},\n\n🔧 RO Maintenance Reminder\n\nRegular maintenance ensures your RO water purifier works efficiently and provides clean, safe water.\n\nBenefits of regular service:\n✅ Clean filters for better water quality\n✅ Optimal RO performance\n✅ Extended equipment life\n✅ Safe drinking water\n\nSchedule your service today:\n📞 Call: 8884944288\n💬 Reply to this message\n\nHydrogen RO Team`;

      case 'follow_up':
        return `Hi ${customer.fullName},\n\nWe hope you're satisfied with our service!\n\nIs everything working well with your RO water purifier? If you need any assistance or have questions, we're just a message away.\n\nFor support:\n📞 8884944288\n💬 Reply here\n\nThank you for choosing Hydrogen RO!\nHydrogen RO Team`;

      case 'custom':
        return `Hi ${customer.fullName},\n\nThis is Hydrogen RO. How can we assist you today?\n\nFor service bookings or inquiries:\n📞 8884944288\n💬 Reply to this message\n\nHydrogen RO Team`;

      default:
        return `Hi ${customer.fullName},\n\nThis is Hydrogen RO. How can we assist you today?\n\n📞 Call: 8884944288\n💬 Reply to this message\n\nHydrogen RO Team`;
    }
  };

  const handleWhatsApp = (customer: CustomerWithHistory) => {
    const phoneNumber = customer.phone?.replace(/\D/g, '');
    if (!phoneNumber) {
      toast.error('Phone number not available');
      return;
    }
    setSelectedCustomerForWhatsApp(customer);
    setWhatsappDialogOpen(true);
  };

  const sendWhatsAppMessage = (customer: CustomerWithHistory, template: string) => {
    if (!customer.phone) {
      toast.error('Phone number not available');
      return;
    }

    const formattedPhone = formatPhoneForWhatsApp(customer.phone);
    const message = generateWhatsAppMessage(customer, template);
    const whatsappUrl = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
    
    // Close dialog and open status dialog
    setWhatsappDialogOpen(false);
    setSelectedCustomerForWhatsApp(null);
    openStatusDialog(customer, 'WHATSAPP', customer.phone, message);
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
      
      // Now fetch jobs using the customer's UUID
      const { data: jobs, error } = await db.jobs.getByCustomerId(customer.id);
      
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

  const getServiceBadgeColor = (days?: number | null) => {
    if (!days) return 'bg-gray-500';
    if (days < 90) return 'bg-green-500';
    if (days < 180) return 'bg-yellow-500';
    if (days < 365) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const getStatusBadge = (status?: string | null) => {
    if (!status) return null;
    
    const statusConfig: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
      'ANSWERED': { label: 'Answered', className: 'bg-green-100 text-green-800', icon: <CheckCircle2 className="w-3 h-3 mr-1" /> },
      'NO_ANSWER': { label: 'No Answer', className: 'bg-yellow-100 text-yellow-800', icon: <XCircle className="w-3 h-3 mr-1" /> },
      'BUSY': { label: 'Busy', className: 'bg-orange-100 text-orange-800', icon: <Phone className="w-3 h-3 mr-1" /> },
      'FAILED': { label: 'Failed', className: 'bg-red-100 text-red-800', icon: <XCircle className="w-3 h-3 mr-1" /> },
      'DELIVERED': { label: 'Delivered', className: 'bg-green-100 text-green-800', icon: <CheckCircle2 className="w-3 h-3 mr-1" /> },
      'NOT_DELIVERED': { label: 'Not Delivered', className: 'bg-red-100 text-red-800', icon: <XCircle className="w-3 h-3 mr-1" /> },
      'COMPLETED': { label: 'Completed', className: 'bg-blue-100 text-blue-800', icon: <CheckCircle2 className="w-3 h-3 mr-1" /> },
    };

    const config = statusConfig[status] || { label: status, className: 'bg-gray-100 text-gray-800', icon: null };
    
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
        { value: 'ANSWERED', label: 'Answered' },
        { value: 'NO_ANSWER', label: 'No Answer' },
        { value: 'BUSY', label: 'Busy' },
        { value: 'FAILED', label: 'Failed' },
      ];
    } else {
      return [
        { value: 'DELIVERED', label: 'Delivered' },
        { value: 'NOT_DELIVERED', label: 'Not Delivered' },
        { value: 'COMPLETED', label: 'Completed' },
      ];
    }
  };

  // Show loading while checking auth or loading data
  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-3"></div>
          <p className="text-gray-600">{authLoading ? 'Checking authentication...' : 'Loading customers...'}</p>
        </div>
      </div>
    );
  }

  // Show access denied if not admin (only if standalone page)
  if (!hideHeader && (!user || !isAdmin)) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6">
          <Lock className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-gray-600 mb-4">
            This page is restricted to administrators only. Please log in with an admin account to access this feature.
          </p>
          <Button onClick={() => navigate('/admin')} className="bg-blue-600 hover:bg-blue-700">
            Go to Admin Login
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header - only show if not embedded */}
      {!hideHeader && (
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 py-4 sm:py-0 sm:h-16">
              <div className="flex items-center">
                <Phone className="w-6 h-6 sm:w-8 sm:h-8 text-blue-600 mr-2 sm:mr-3 shrink-0" />
                <div>
                  <h1 className="text-lg sm:text-xl font-bold text-gray-900">Customer Calling & Messaging</h1>
                  <p className="text-xs sm:text-sm text-gray-600">Contact customers for service reminders</p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onBack || (() => navigate('/settings'))}
                  className="text-gray-600 hover:text-gray-900"
                >
                  <ArrowLeft className="w-4 h-4 mr-1" />
                  Back
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
        {/* Filters */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="w-5 h-5" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label htmlFor="search">Search</Label>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
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
                    <SelectItem value="AMC Service">AMC Service</SelectItem>
                    <SelectItem value="New Purifier Installation">New Purifier Installation</SelectItem>
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
                    <SelectItem value="ANSWERED">Answered</SelectItem>
                    <SelectItem value="NO_ANSWER">No Answer</SelectItem>
                    <SelectItem value="BUSY">Busy</SelectItem>
                    <SelectItem value="DELIVERED">Delivered</SelectItem>
                    <SelectItem value="NOT_DELIVERED">Not Delivered</SelectItem>
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
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-gray-900">{filteredCustomers.length}</div>
              <div className="text-sm text-gray-600">Customers to Contact</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-green-600">
                {filteredCustomers.filter(c => c.daysSinceService && c.daysSinceService >= 365).length}
              </div>
              <div className="text-sm text-gray-600">Over 1 Year Since Service</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-orange-600">
                {filteredCustomers.filter(c => c.daysSinceService && c.daysSinceService >= 180 && c.daysSinceService < 365).length}
              </div>
              <div className="text-sm text-gray-600">6-12 Months Since Service</div>
            </CardContent>
          </Card>
        </div>

        {/* Customer List */}
        <div className="space-y-4">
          {filteredCustomers.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-gray-500">No customers found matching your filters.</p>
                <p className="text-sm text-gray-400 mt-2">Try setting Service History to &quot;All Customers&quot;.</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Results count and items per page selector */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                <div className="text-sm text-gray-600">
                  Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredCustomers.length)} of {filteredCustomers.length} customers
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="itemsPerPage" className="text-sm">Items per page:</Label>
                  <Select value={itemsPerPage.toString()} onValueChange={(value) => {
                    setItemsPerPage(parseInt(value));
                    setCurrentPage(1);
                  }}>
                    <SelectTrigger className="w-20">
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

              {paginatedCustomers.map((customer) => (
              <Card key={customer.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4 sm:p-6">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-start gap-3 mb-3">
                        <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center shrink-0">
                          <User className="w-5 h-5 text-blue-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className={`font-semibold text-base sm:text-lg ${customerNameClassName(customer) || 'text-gray-900'}`}>
                              {customer.fullName}
                            </h3>
                            <Badge variant="outline">{customer.customerId}</Badge>
                            {customer.daysSinceContact !== null && customer.daysSinceContact !== undefined && customer.daysSinceContact < recentContactDays && (
                              <Badge className="bg-yellow-100 text-yellow-800">
                                <Clock className="w-3 h-3 mr-1" />
                                Contacted {formatDaysAgo(customer.daysSinceContact)} ago
                              </Badge>
                            )}
                          </div>
                          
                          <div className="space-y-1 text-sm text-gray-600">
                            <div className="flex items-center gap-2">
                              <Phone className="w-4 h-4" />
                              <span>{customer.phone}</span>
                              {customer.alternatePhone && (
                                <span className="text-gray-400">/ {customer.alternatePhone}</span>
                              )}
                            </div>
                            {customer.email && (
                              <div className="flex items-center gap-2">
                                <Mail className="w-4 h-4" />
                                <span>{customer.email}</span>
                              </div>
                            )}
                            {(customer.rawWaterTds != null && customer.rawWaterTds > 0) && (
                              <div className="flex items-center gap-2">
                                <span className="text-gray-500">Raw water TDS:</span>
                                <span className="font-medium">{customer.rawWaterTds} ppm</span>
                              </div>
                            )}
                            <div className="flex items-center gap-2">
                              <Calendar className="w-4 h-4" />
                              <span>
                                Last Service: {formatDate(customer.lastServiceDate)}
                                {customer.daysSinceService !== null && customer.daysSinceService !== undefined && (
                                  <Badge className={`ml-2 ${getServiceBadgeColor(customer.daysSinceService)} text-white text-xs`}>
                                    {formatDaysAgo(customer.daysSinceService)} ago
                                  </Badge>
                                )}
                              </span>
                            </div>
                            {customer.lastContacted && (
                              <div className="flex items-center gap-2 flex-wrap">
                                <Clock className="w-4 h-4" />
                                <span className="text-gray-500">
                                  Last Contacted: {formatDate(customer.lastContacted)}
                                  {customer.daysSinceContact !== null && customer.daysSinceContact !== undefined && (
                                    <span className="ml-2">({formatDaysAgo(customer.daysSinceContact)} ago)</span>
                                  )}
                                </span>
                                {customer.lastContactStatus && getStatusBadge(customer.lastContactStatus)}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 sm:flex-nowrap">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleCall(customer)}
                        className="flex-1 sm:flex-none"
                      >
                        <Phone className="w-4 h-4 mr-2" />
                        Call
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleWhatsApp(customer)}
                        className="flex-1 sm:flex-none bg-green-50 hover:bg-green-100 text-green-700 border-green-200"
                      >
                        <WhatsAppIcon className="w-4 h-4 mr-2" />
                        WhatsApp
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleViewPhotos(customer)}
                        disabled={isLoadingPhotos && selectedCustomerForPhotos?.id === customer.id}
                        className="flex-1 sm:flex-none"
                      >
                        {isLoadingPhotos && selectedCustomerForPhotos?.id === customer.id ? (
                          <div className="w-4 h-4 border-2 border-gray-600 border-t-transparent rounded-full animate-spin mr-2" />
                        ) : (
                          <Camera className="w-4 h-4 mr-2" />
                        )}
                        Photos
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedCustomerForReport(customer);
                          setCustomerReportDialogOpen(true);
                        }}
                        className="flex-1 sm:flex-none"
                      >
                        <FileText className="w-4 h-4 mr-2" />
                        Reports
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
              ))}

              {/* Pagination */}
              {filteredCustomers.length > itemsPerPage && (
                <div className="mt-6">
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          href="#"
                          onClick={(e) => {
                            e.preventDefault();
                            if (currentPage > 1) {
                              setCurrentPage(currentPage - 1);
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }
                          }}
                          className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                        />
                      </PaginationItem>

                      {/* Page numbers */}
                      {Array.from({ length: Math.ceil(filteredCustomers.length / itemsPerPage) }, (_, i) => i + 1).map((page) => {
                        // Show first page, last page, current page, and pages around current
                        const totalPages = Math.ceil(filteredCustomers.length / itemsPerPage);
                        const showPage = 
                          page === 1 ||
                          page === totalPages ||
                          (page >= currentPage - 1 && page <= currentPage + 1);

                        if (!showPage) {
                          // Show ellipsis
                          if (page === currentPage - 2 || page === currentPage + 2) {
                            return (
                              <PaginationItem key={page}>
                                <PaginationEllipsis />
                              </PaginationItem>
                            );
                          }
                          return null;
                        }

                        return (
                          <PaginationItem key={page}>
                            <PaginationLink
                              href="#"
                              onClick={(e) => {
                                e.preventDefault();
                                setCurrentPage(page);
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                              }}
                              isActive={currentPage === page}
                              className="cursor-pointer"
                            >
                              {page}
                            </PaginationLink>
                          </PaginationItem>
                        );
                      })}

                      <PaginationItem>
                        <PaginationNext
                          href="#"
                          onClick={(e) => {
                            e.preventDefault();
                            if (currentPage < Math.ceil(filteredCustomers.length / itemsPerPage)) {
                              setCurrentPage(currentPage + 1);
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }
                          }}
                          className={
                            currentPage >= Math.ceil(filteredCustomers.length / itemsPerPage)
                              ? 'pointer-events-none opacity-50'
                              : 'cursor-pointer'
                          }
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* WhatsApp Message Template Dialog */}
      <Dialog open={whatsappDialogOpen} onOpenChange={(open) => {
        setWhatsappDialogOpen(open);
        if (!open) {
          setSelectedCustomerForWhatsApp(null);
        }
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <WhatsAppIcon className="w-5 h-5 text-green-600" />
              Select WhatsApp Message
            </DialogTitle>
            <DialogDescription asChild>
              <span>
                Choose a message template to send to{' '}
                <span className={customerNameClassName(selectedCustomerForWhatsApp as any)}>
                  {selectedCustomerForWhatsApp?.fullName}
                </span>
              </span>
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-2 py-4">
            {selectedCustomerForWhatsApp && (
              <>
                <Button
                  variant="outline"
                  className="w-full justify-start h-auto py-3 px-4 text-left"
                  onClick={() => sendWhatsAppMessage(selectedCustomerForWhatsApp, 'service_due')}
                >
                  <div className="flex flex-col items-start">
                    <div className="font-semibold">Service Due Reminder</div>
                    <div className="text-xs text-gray-500 mt-1">Remind about upcoming service</div>
                  </div>
                </Button>

                <Button
                  variant="outline"
                  className="w-full justify-start h-auto py-3 px-4 text-left"
                  onClick={() => sendWhatsAppMessage(selectedCustomerForWhatsApp, 'contact')}
                >
                  <div className="flex flex-col items-start">
                    <div className="font-semibold">Contact Message</div>
                    <div className="text-xs text-gray-500 mt-1">General contact and support</div>
                  </div>
                </Button>

                <Button
                  variant="outline"
                  className="w-full justify-start h-auto py-3 px-4 text-left"
                  onClick={() => sendWhatsAppMessage(selectedCustomerForWhatsApp, 'website')}
                >
                  <div className="flex flex-col items-start">
                    <div className="font-semibold">Website Information</div>
                    <div className="text-xs text-gray-500 mt-1">Share website and contact details</div>
                  </div>
                </Button>

                <Button
                  variant="outline"
                  className="w-full justify-start h-auto py-3 px-4 text-left"
                  onClick={() => sendWhatsAppMessage(selectedCustomerForWhatsApp, 'maintenance_reminder')}
                >
                  <div className="flex flex-col items-start">
                    <div className="font-semibold">Maintenance Reminder</div>
                    <div className="text-xs text-gray-500 mt-1">Benefits of regular maintenance</div>
                  </div>
                </Button>

                <Button
                  variant="outline"
                  className="w-full justify-start h-auto py-3 px-4 text-left"
                  onClick={() => sendWhatsAppMessage(selectedCustomerForWhatsApp, 'follow_up')}
                >
                  <div className="flex flex-col items-start">
                    <div className="font-semibold">Follow Up</div>
                    <div className="text-xs text-gray-500 mt-1">Check satisfaction after service</div>
                  </div>
                </Button>

                <Button
                  variant="outline"
                  className="w-full justify-start h-auto py-3 px-4 text-left"
                  onClick={() => sendWhatsAppMessage(selectedCustomerForWhatsApp, 'custom')}
                >
                  <div className="flex flex-col items-start">
                    <div className="font-semibold">Custom Message</div>
                    <div className="text-xs text-gray-500 mt-1">Simple greeting and contact info</div>
                  </div>
                </Button>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setWhatsappDialogOpen(false);
              setSelectedCustomerForWhatsApp(null);
            }}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                  <p className="text-sm text-gray-600 capitalize">{pendingContact.contactType.toLowerCase()}</p>
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
            <Button onClick={handleStatusSubmit} className="bg-blue-600 hover:bg-blue-700">
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
            // Open photo in new tab
            window.open(photo, '_blank');
          }}
          onDeletePhoto={() => {
            // Disable delete in calling page
          }}
        />
      )}

      {/* Customer Report Dialog */}
      <CustomerReportDialog
        open={customerReportDialogOpen}
        customer={selectedCustomerForReport}
        technicians={technicians}
        onOpenChange={(open) => {
          setCustomerReportDialogOpen(open);
          if (!open) {
            setSelectedCustomerForReport(null);
          }
        }}
        onPhotoClick={(url, index, total) => {
          setReportSelectedBillPhotos(null);
          setReportSelectedPhoto({ url, index, total });
          setReportPhotoViewerOpen(true);
        }}
        onBillPhotosClick={(photos, index) => {
          setReportSelectedBillPhotos(photos);
          setReportSelectedPhoto({ url: photos[index], index, total: photos.length });
          setReportPhotoViewerOpen(true);
        }}
      />

      {/* Photo viewer for report images (payment/bill click-to-view) */}
      <PhotoViewerDialog
        open={reportPhotoViewerOpen}
        onOpenChange={setReportPhotoViewerOpen}
        selectedPhoto={reportSelectedPhoto}
        selectedBillPhotos={reportSelectedBillPhotos}
        selectedJobPhotos={null}
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
          setReportPhotoViewerOpen(false);
          setReportSelectedPhoto(null);
          setReportSelectedBillPhotos(null);
        }}
      />
    </div>
  );
};

export default CallingPage;

