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
  MessageSquare
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
import { calculateTechnicianDistances, TechnicianDistance } from '@/lib/distance';
import BillModal from './BillModal';
import AMCModal from './AMCModal';
import QuotationModal from './QuotationModal';
import TaxInvoiceModal from './TaxInvoiceModal';
import GSTInvoicesPage from './GSTInvoicesPage';
import ImageUpload from '@/components/ImageUpload';

declare global {
  interface Window {
    google: typeof google;
    initMap: () => void;
  }
}

// Generate job number utility
const generateJobNumber = (serviceType: 'RO' | 'SOFTENER'): string => {
  const prefix = serviceType === 'RO' ? 'RO' : 'WS';
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.floor(Math.random() * 100).toString().padStart(2, '0');
  return `${prefix}${timestamp}${random}`;
};

// Map service types array to database service_type value
// Helper function to format preferred time slot with custom time
const formatPreferredTimeSlot = (timeSlot: string | undefined, customTime: string | null | undefined): string => {
  if (!timeSlot) return 'Not specified';
  
  if (timeSlot === 'CUSTOM' && customTime) {
    // Format custom time (HH:MM) to readable format (e.g., "2:30 PM")
    const [hours, minutes] = customTime.split(':');
    const hour24 = parseInt(hours);
    const hour12 = hour24 > 12 ? hour24 - 12 : (hour24 === 0 ? 12 : hour24);
    const ampm = hour24 >= 12 ? 'PM' : 'AM';
    return `Custom: ${hour12}:${minutes} ${ampm}`;
  }
  
  const timeSlotMap: { [key: string]: string } = {
    'MORNING': 'Morning (9 AM - 1 PM)',
    'AFTERNOON': 'Afternoon (1 PM - 6 PM)',
    'EVENING': 'Evening (6 PM - 9 PM)',
    'CUSTOM': 'Custom Time'
  };
  
  return timeSlotMap[timeSlot] || timeSlot;
};

const mapServiceTypesToDbValue = (serviceTypes: string[]): string => {
  if (serviceTypes.length === 0) return 'RO'; // Default
  
  const sortedTypes = [...serviceTypes].sort();
  const hasRO = sortedTypes.includes('RO');
  const hasSOFTENER = sortedTypes.includes('SOFTENER');
  const hasAC = sortedTypes.includes('AC');
  const hasAPPLIANCE = sortedTypes.includes('APPLIANCE');
  
  // Check for ALL_SERVICES (RO, SOFTENER, AC)
  if (hasRO && hasSOFTENER && hasAC && sortedTypes.length === 3) {
    return 'ALL_SERVICES';
  }
  
  // Check for RO_SOFTENER
  if (hasRO && hasSOFTENER && sortedTypes.length === 2) {
    return 'RO_SOFTENER';
  }
  
  // Check for RO_AC
  if (hasRO && hasAC && sortedTypes.length === 2) {
    return 'RO_AC';
  }
  
  // Check for SOFTENER_AC
  if (hasSOFTENER && hasAC && sortedTypes.length === 2) {
    return 'SOFTENER_AC';
  }
  
  // Single service types
  if (sortedTypes.length === 1) {
    return sortedTypes[0];
  }
  
  // Fallback: if multiple types not matching above, use first one
  return sortedTypes[0] || 'RO';
};

// WhatsApp Icon Component
const WhatsAppIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488"/>
  </svg>
);

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { user, isAdmin, loading: authLoading } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
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
  
  // Ref to store calculateDistanceAndTime function to avoid circular dependency
  const calculateDistanceAndTimeRef = useRef<((origin: { lat: number; lng: number }, destination: { lat: number; lng: number }, customerId: string) => Promise<void>) | null>(null);
  
  const bangaloreAreas = [
    // Popular Areas
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
    // Additional North Bangalore
    'Sanjay Nagar', 'Gokula', 'Attiguppe', 'Vijaya Nagar', 'Nagarbhavi', 'Kengeri', 'Rajajinagar Extension',
    'Basaveshwara Nagar', 'Vijayanagar Extension', 'Yeshwanthpur Industrial', 'Nelamangala', 'Doddaballapur',
    'Devanahalli', 'Yelahanka New Town', 'Jakkur', 'Bagalur', 'Vidyaranyapura', 'MS Palya', 'Byatarayanapura',
    // Additional South Bangalore
    'BTM 2nd Stage', 'BTM 1st Stage', 'Uttarahalli', 'Girinagar',
    'JP Nagar 1st Phase', 'JP Nagar 2nd Phase', 'JP Nagar 3rd Phase', 'JP Nagar 4th Phase', 'JP Nagar 5th Phase',
    'JP Nagar 6th Phase', 'JP Nagar 7th Phase', 'JP Nagar 8th Phase', 'JP Nagar 9th Phase', 'Bannerghatta Road',
    'Arekere', 'Hulimavu', 'Begur', 'HSR Sector 1', 'HSR Sector 2', 'HSR Sector 3', 'HSR Sector 4',
    'HSR Sector 5', 'HSR Sector 6', 'HSR Sector 7', 'Arakere Mico Layout', 'Bommanahalli', 'Singasandra',
    'Hosa Road', 'Konanakunte', 'Doddakallasandra', 'Vijaya Bank Layout', 'Padmanabhanagar', 'Hosur',
    // Additional East Bangalore
    'Whitefield Main Road', 'ITPL', 'Kadugodi', 'Varthur Kodi', 'Panathur', 'Kundalahalli Gate',
    'AECS Layout', 'Doddanekundi', 'Marathahalli Bridge', 'Varthur Road', 'Whitefield Road', 'Hope Farm',
    'Budigere', 'Avalahalli', 'Bidrahalli', 'Kannamangala', 'Vaddarahalli', 'Chikkajala', 'Bagalur',
    'KR Puram Railway Station', 'Baiyappanahalli', 'Hennur Main Road', 'Kalyan Nagar Main Road',
    // Additional West Bangalore
    'Rajajinagar Industrial', 'Peenya Industrial', 'Jalahalli', 'Dasarahalli', 'Nagasandra', 'Tumkur Road',
    'Nelamangala Road', 'Magadi Road', 'Mysore Road', 'Kengeri Satellite Town', 'Rajarajeshwari Nagar',
    'Kumbalgodu', 'Anjanapura', 'Nayandahalli', 'Kengeri', 'Uttarahalli Hobli', 'Bidadi', 'Ramanagara',
    // Additional Central Bangalore
    'MG Road', 'Brigade Road', 'Commercial Street', 'Residency Road', 'Cubbon Park', 'Vidhana Soudha',
    'Cantonment', 'Bowring', 'Richmond Circle', 'Lavelle Road', 'St Marks Road', 'Kasturba Road',
    'Nrupathunga Road', 'Hudson Circle', 'Kempegowda Bus Stand', 'Shivajinagar Bus Stand', 'Russell Market',
    'Church Street', 'Rest House Road', 'Cunningham Road', 'Miller Road', 'Palace Road',
    'Kempegowda', 'Majestic Bus Stand', 'City Railway Station',
    // Outer Areas
    'Nelamangala', 'Doddaballapur', 'Devanahalli', 'Hoskote', 'Anekal', 'Jigani', 'Bidadi', 'Ramanagara', 'Ramanagaram',
    'Magadi', 'Tumkur', 'Tumkuru', 'Kolar', 'Kolar City', 'Chikkaballapur',
    // Additional Areas - Kaknpura side and nearby
    'Adda', 'Kaknpura', 'Kakanpura', 'Kaknepura', 'Kaknepura Side', 'Kaknpura Side',
    'Ttible', 'Ttibble', 'Tibble', 'Tibble Side',
    // Layouts and Extensions
    'HBR Layout', 'HRBR Layout', 'KHB Layout', 'ARE Layout', 'BEML Layout', 'BEL Layout', 'ISRO Layout',
    'BDA Layout', 'BDA Complex', 'NRI Layout', 'Prestige Layout', 'Prestige Shantiniketan',
    // Generic Types
    'Home', 'Office', 'Shop', 'Factory', 'Warehouse', 'Residence', 'Apartment', 'Villa', 'House',
    'Showroom', 'Workshop', 'Store', 'Building', 'Complex', 'Tower', 'Plaza', 'Mall',
    // More Areas - Extended Coverage
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
    'Yeshwanthpur', 'Yeshwanthpur Industrial',
    // Additional Areas - Kaknpura side, Ramanagara, Kolar, Tumkur
    'Adda', 'Kaknpura', 'Kakanpura', 'Kaknepura', 'Kaknepura Side', 'Kaknpura Side',
    'Ttible', 'Ttibble', 'Tibble', 'Tibble Side',
    'Ramanagaram', 'Kolar City', 'Tumkuru',
    // Additional Popular Areas
    'Adugodi', 'AECS Layout', 'Anekal', 'Anjanapura', 'Arakere Mico Layout', 'Arekere', 'Ashok Nagar',
    'Attiguppe', 'Austin Town', 'Avalahalli', 'Baiyappanahalli', 'Banaswadi', 'Bannerghatta Road',
    'Basapura', 'Basaveshwara Nagar', 'BEML Layout', 'Bhairava Nagar', 'Bidrahalli', 'Bommanahalli',
    'Bommasandra', 'Brigade Road', 'Brookefield', 'BTM 1st Stage', 'BTM 2nd Stage', 'Budigere',
    'Byatarayanapura', 'Chikkajala', 'City Railway Station', 'Commercial Street', 'Cooke Town',
    'Cox Town', 'Cunningham Road', 'CV Raman Nagar', 'Dasarahalli', 'Devanahalli', 'Doddaballapur',
    'Doddakallasandra', 'Doddanekundi', 'Domlur', 'Electronic City', 'Frazer Town', 'Gandhinagar',
    'Girinagar', 'Gokula', 'HAL', 'Hebbal', 'Hennur', 'Hennur Main Road', 'Hoodi', 'Hope Farm',
    'Horamavu', 'Hosa Road', 'Hoskote', 'Hosur', 'Hosur Road', 'HSR Sector 1', 'HSR Sector 2',
    'HSR Sector 3', 'HSR Sector 4', 'HSR Sector 5', 'HSR Sector 6', 'HSR Sector 7', 'Hudson Circle',
    'Hulimavu', 'Indiranagar', 'ITPL', 'Jakkur', 'Jalahalli', 'Jayanagar', 'Jigani', 'JP Nagar 1st Phase',
    'JP Nagar 2nd Phase', 'JP Nagar 3rd Phase', 'JP Nagar 4th Phase', 'JP Nagar 5th Phase',
    'JP Nagar 6th Phase', 'JP Nagar 7th Phase', 'JP Nagar 8th Phase', 'JP Nagar 9th Phase',
    'Kadubeesanahalli', 'Kadugodi', 'Kaggadasapura', 'Kalyan Nagar', 'Kalyan Nagar Main Road',
    'Kannamangala', 'Kasturba Road', 'Kempegowda', 'Kempegowda Bus Stand', 'Kengeri',
    'Kengeri Satellite Town', 'Konanakunte', 'Koramangala', 'Kothanur', 'KR Market', 'KR Puram',
    'KR Puram Railway Station', 'Kumbalgodu', 'Kundalahalli', 'Kundalahalli Gate', 'Lalbagh',
    'Lavelle Road', 'Magadi', 'Magadi Road', 'Mahadevapura', 'Majestic', 'Majestic Bus Stand',
    'Marathahalli', 'Marathahalli Bridge', 'Mathikere', 'MG Road', 'Miller Road', 'MS Palya',
    'Murphy Town', 'Murugeshpalya', 'Mysore Road', 'Nagarbhavi', 'Nagasandra', 'Nagavara',
    'Nayandahalli', 'Nelamangala', 'Nelamangala Road', 'NRI Layout', 'Nrupathunga Road',
    'Padmanabhanagar', 'Palace Road', 'Panathur', 'Peenya', 'Peenya Industrial', 'Prestige Layout',
    'Prestige Shantiniketan', 'Rajarajeshwari Nagar', 'Rajajinagar', 'Rajajinagar Extension',
    'Rajajinagar Industrial', 'Ramamurthy Nagar', 'Ramanagara', 'Residency Road', 'Rest House Road',
    'Richmond', 'Richmond Circle', 'Richmond Town', 'RT Nagar', 'Russell Market', 'Sahakara Nagar',
    'Sanjay Nagar', 'Sarjapur', 'Shanti Nagar', 'Shivajinagar', 'Shivajinagar Bus Stand', 'Singasandra', 'Seshadripuram',
    'St Marks Road', 'Thanisandra', 'Tumkur', 'Tumkur Road', 'Ulsoor', 'Uttarahalli',
    'Uttarahalli Hobli', 'Vaddarahalli', 'Varthur', 'Varthur Kodi', 'Varthur Road', 'Vasanthnagar',
    'Vidhana Soudha', 'Vidyaranyapura', 'Vijaya Bank Layout', 'Vijaya Nagar', 'Vijayanagar',
    'Vijayanagar Extension', 'Whitefield', 'Whitefield Main Road', 'Whitefield Road', 'Wilson Garden',
    'Yelahanka', 'Yelahanka New Town', 'Yeshwanthpur', 'Yeshwanthpur Industrial'
  ];

  // Calculate Levenshtein distance for fuzzy matching (handles typos)
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
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
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
    return 1 - (distance / maxLen);
  };

  // Reusable function to extract location from any address string
  // Only returns a match if it's confident - otherwise returns null
  const extractLocationFromAddressString = (completeAddress: string): string | null => {
    if (!completeAddress || completeAddress.trim().length === 0) {
      return null;
    }

    // Remove duplicates from bangaloreAreas
    const uniqueAreas = [...new Set(bangaloreAreas)];
    
    // Split address by common delimiters and extract potential location keywords
    const addressParts = completeAddress
      .split(/[,\s]+/)
      .map(part => part.trim())
      .filter(part => part.length > 2); // Filter out very short parts

    // First, try exact matches (highest priority - most confident)
    for (const part of addressParts) {
      const partLower = part.toLowerCase();
      const exactMatch = uniqueAreas.find(area => 
        area.toLowerCase() === partLower
      );
      if (exactMatch) {
        return exactMatch;
      }
    }

    // Second, try multi-word exact matches (e.g., "G.B palya" should match "G.B palya")
    // This is more confident than partial matches
    for (let i = 0; i < addressParts.length - 1; i++) {
      const twoWordPart = `${addressParts[i]} ${addressParts[i + 1]}`.toLowerCase();
      const multiWordMatch = uniqueAreas.find(area => 
        area.toLowerCase() === twoWordPart
      );
      if (multiWordMatch) {
        return multiWordMatch;
      }
    }

    // Third, try strict partial matches (only if part is significant length and match is substantial)
    // Only match if the part is at least 5 characters and the match covers at least 70% of the shorter string
    for (const part of addressParts) {
      if (part.length < 5) continue; // Require at least 5 characters for partial match
      const partLower = part.toLowerCase();
      const partialMatch = uniqueAreas.find(area => {
        const areaLower = area.toLowerCase();
        // Only match if one contains the other AND the overlap is substantial
        if (areaLower.includes(partLower)) {
          // Part must be at least 70% of the area name
          return partLower.length >= areaLower.length * 0.7;
        }
        if (partLower.includes(areaLower)) {
          // Area must be at least 70% of the part
          return areaLower.length >= partLower.length * 0.7;
        }
        return false;
      });
      if (partialMatch) {
        return partialMatch;
      }
    }

    // Last resort: fuzzy matching for typos (very strict - only for longer parts with high similarity)
    let bestMatch: string | null = null;
    let bestScore = 0.85; // Very high threshold (85%) to avoid false matches

    for (const part of addressParts) {
      if (part.length < 6) continue; // Require at least 6 characters for fuzzy matching

      for (const area of uniqueAreas) {
        // Skip if lengths are too different (more than 30% difference - very strict)
        const lengthDiff = Math.abs(area.length - part.length) / Math.max(area.length, part.length);
        if (lengthDiff > 0.3) continue;

        // Calculate similarity
        const similarity = calculateSimilarity(part, area);
        
        // Only use fuzzy match if similarity is very high
        if (similarity > bestScore) {
          bestScore = similarity;
          bestMatch = area;
        }
      }
    }

    // Only return match if we found a confident one, otherwise return null
    return bestMatch;
  };

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
  // Complete job multi-step form state
  const [completeJobStep, setCompleteJobStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);
  const [billAmount, setBillAmount] = useState<string>('');
  const [billPhotos, setBillPhotos] = useState<string[]>([]);
  const [paymentPhotos, setPaymentPhotos] = useState<string[]>([]);
  const [amcDateGiven, setAmcDateGiven] = useState<string>('');
  const [amcEndDate, setAmcEndDate] = useState<string>('');
  const [amcYears, setAmcYears] = useState<number>(1);
  const [amcIncludesPrefilter, setAmcIncludesPrefilter] = useState<boolean>(false);
  const [hasAMC, setHasAMC] = useState<boolean>(false);
  const [paymentMode, setPaymentMode] = useState<'CASH' | 'ONLINE' | ''>('');
  const [customerHasPrefilter, setCustomerHasPrefilter] = useState<boolean | null>(null);
  const [qrCodeType, setQrCodeType] = useState<string>('');
  const [selectedQrCodeId, setSelectedQrCodeId] = useState<string>('');
  const [commonQrCodes, setCommonQrCodes] = useState<CommonQrCode[]>([]);
  const [technicianQrCode, setTechnicianQrCode] = useState<string>('');
  const [technicianName, setTechnicianName] = useState<string>('');
  const [customerQrPhotos, setCustomerQrPhotos] = useState<string[]>([]);
  const [paymentScreenshot, setPaymentScreenshot] = useState<string>('');
  const [billAmountConfirmOpen, setBillAmountConfirmOpen] = useState(false);
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
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ONGOING' | 'PENDING' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'RESCHEDULED'>('ONGOING');
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
  const [editJobFormData, setEditJobFormData] = useState({
    serviceType: 'RO' as 'RO' | 'SOFTENER',
    serviceSubType: 'Installation',
    serviceSubTypeCustom: '',
    description: '',
    scheduledDate: '',
    scheduledTimeSlot: 'MORNING' as 'MORNING' | 'AFTERNOON' | 'EVENING' | 'CUSTOM' | 'FLEXIBLE',
    scheduledTimeCustom: '',
    lead_source: 'Direct call',
    lead_source_custom: ''
  });
  const [photoToDelete, setPhotoToDelete] = useState<{jobId: string, photoIndex: number, photoUrl: string} | null>(null);
  const [deletePhotoDialogOpen, setDeletePhotoDialogOpen] = useState(false);
  const [isDeletingPhoto, setIsDeletingPhoto] = useState(false);
  const [photoViewerOpen, setPhotoViewerOpen] = useState(false);
  
  // Job assignment states
  const [assignJobDialogOpen, setAssignJobDialogOpen] = useState(false);
  const [jobToAssign, setJobToAssign] = useState<Job | null>(null);
  const [selectedTechnicianId, setSelectedTechnicianId] = useState('');
  const [selectedTechnicianIds, setSelectedTechnicianIds] = useState<string[]>([]);
  const [isCreatingAssignmentRequests, setIsCreatingAssignmentRequests] = useState(false);
  const [assignmentType, setAssignmentType] = useState<'direct' | 'bulk'>('direct');
  const [technicianDistances, setTechnicianDistances] = useState<TechnicianDistance[]>([]);
  const [loadingDistances, setLoadingDistances] = useState(false);

  useEffect(() => {
    registerAdminPWA();
    
    // Cleanup: disable PWA when component unmounts
    return () => {
      disablePWA();
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
          rawData: data.map(t => ({
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
    createdAt: customer.created_at,
    updatedAt: customer.updated_at
  });

  // Reset assignment type when dialog closes
  useEffect(() => {
    if (!assignJobDialogOpen) {
      setAssignmentType('direct');
      setSelectedTechnicianId('');
      setSelectedTechnicianIds([]);
      setTechnicianDistances([]);
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

  useEffect(() => {
    loadQrCodes();
  }, [loadQrCodes]);

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

  // Load unique brands and models from database
  const loadBrandsAndModels = useCallback(async () => {
    try {
      // Fetch unique brands from customers
      const { data: customerData, error: customerError } = await supabase
        .from('customers')
        .select('brand')
        .not('brand', 'is', null)
        .neq('brand', '')
        .neq('brand', 'Not specified');
      
      // Fetch unique brands from jobs
      const { data: jobData, error: jobError } = await supabase
        .from('jobs')
        .select('brand')
        .not('brand', 'is', null)
        .neq('brand', '')
        .neq('brand', 'Not specified');
      
      // Fetch unique models from customers
      const { data: customerModelData, error: customerModelError } = await supabase
        .from('customers')
        .select('model')
        .not('model', 'is', null)
        .neq('model', '')
        .neq('model', 'Not specified');
      
      // Fetch unique models from jobs
      const { data: jobModelData, error: jobModelError } = await supabase
        .from('jobs')
        .select('model')
        .not('model', 'is', null)
        .neq('model', '')
        .neq('model', 'Not specified');
      
      if (!customerError && !jobError && !customerModelError && !jobModelError) {
        // Extract all brands (handle comma-separated values)
        const allBrands = new Set<string>();
        [...(customerData || []), ...(jobData || [])].forEach(item => {
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
        [...(customerModelData || []), ...(jobModelData || [])].forEach(item => {
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
      
      // Load customers and technicians (always needed)
      // Only load jobs for ongoing view initially
      const [customersResult, techniciansResult] = await Promise.all([
        db.customers.getAll(),
        db.technicians.getAll()
      ]);

      // Log errors for debugging
      if (customersResult.error) {
        toast.error(`Failed to load customers: ${customersResult.error.message}`);
      }
      if (techniciansResult.error) {
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
          rawData: techniciansResult.data.map(t => ({
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

      // Load job counts for stats
      await loadJobCounts();
      
      // Load brands and models from database
      await loadBrandsAndModels();
      
      // Load initial jobs based on filter (defaults to ALL which shows ongoing)
      await loadFilteredJobs(statusFilter, currentPage);

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

  // Auto-save after 5 seconds of inactivity
  useEffect(() => {
    // Only auto-save if there's an editing customer and we're not currently updating
    if (!editingCustomer || isUpdating) return;

    // Compare current form data with last saved to detect changes
    const currentFormDataString = JSON.stringify(editFormData);
    const hasChanges = currentFormDataString !== lastSavedFormDataRef.current;

    if (!hasChanges) {
      // No changes, clear any existing timer
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      hasUnsavedChangesRef.current = false;
      return;
    }

    // Mark that we have unsaved changes
    hasUnsavedChangesRef.current = true;

    // Clear existing timer if any
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    // Set new timer for 5 seconds
    autoSaveTimerRef.current = setTimeout(async () => {
      // Only save if we still have unsaved changes and editing customer exists
      if (hasUnsavedChangesRef.current && editingCustomer && !isUpdating) {
        try {
          // Use the same logic as handleUpdateCustomer
          const updatedAddress = {
            street: editFormData.address.street,
            area: editFormData.address.area,
            city: editFormData.address.city,
            state: editFormData.address.state,
            pincode: editFormData.address.pincode
          };

          const updatedLocation: any = {
            latitude: editFormData.location.latitude || 0,
            longitude: editFormData.location.longitude || 0,
            formattedAddress: editFormData.address.street || editFormData.location.formattedAddress || '',
          };
          
          if (editFormData.google_location && editFormData.google_location.trim()) {
            updatedLocation.googleLocation = editFormData.google_location;
          } else if ((editFormData.location as any)?.googleLocation) {
            updatedLocation.googleLocation = (editFormData.location as any).googleLocation;
          }

          const { data: updatedCustomerFromDb, error } = await db.customers.update(editingCustomer.id, {
            full_name: editFormData.full_name,
            phone: editFormData.phone,
            alternate_phone: editFormData.alternate_phone,
            email: editFormData.email,
            service_type: mapServiceTypesToDbValue(editFormData.service_types),
            brand: Object.values(editFormData.equipment).map(eq => eq.brand).join(', '),
            model: Object.values(editFormData.equipment).map(eq => eq.model).join(', '),
            preferred_language: (editFormData.native_language || 'ENGLISH') as 'ENGLISH' | 'HINDI' | 'KANNADA' | 'TAMIL' | 'TELUGU',
            preferred_time_slot: (editingCustomer as any).preferred_time_slot || editingCustomer.preferredTimeSlot || 'MORNING',
            status: editFormData.status as 'ACTIVE' | 'INACTIVE' | 'BLOCKED',
            notes: editFormData.notes,
            visible_address: editFormData.visible_address ? editFormData.visible_address.substring(0, 20) : '',
            custom_time: editFormData.custom_time || null,
            has_prefilter: editFormData.has_prefilter,
            address: updatedAddress,
            location: updatedLocation
          });

          if (error) {
            throw new Error(error.message);
          }

          // Update local state
          if (updatedCustomerFromDb) {
            const transformedCustomer = transformCustomerData(updatedCustomerFromDb);
            setCustomers(prevCustomers => 
              prevCustomers.map(c => c.id === editingCustomer.id ? transformedCustomer : c)
            );
          } else {
            setCustomers(prevCustomers => {
              return prevCustomers.map(c => {
                if (c.id === editingCustomer.id) {
                  const newLocation = {
                    latitude: updatedLocation.latitude,
                    longitude: updatedLocation.longitude,
                    formattedAddress: updatedLocation.formattedAddress,
                    googlePlaceId: c.location?.googlePlaceId,
                    googleLocation: updatedLocation.googleLocation || null
                  };
                  
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

          // Update tracking refs
          lastSavedFormDataRef.current = JSON.stringify(editFormData);
          hasUnsavedChangesRef.current = false;
          
          // If dialog is closed, clear editing customer after auto-save
          if (!editDialogOpen) {
            setEditingCustomer(null);
          }
          
          toast.success('Customer auto-saved successfully!');
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
          console.error('Error auto-saving customer:', error);
          toast.error(`Auto-save failed: ${errorMessage}`);
        }
      }
      
      autoSaveTimerRef.current = null;
    }, 5000); // 5 seconds

    // Cleanup on unmount or when dependencies change
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, [editFormData, editingCustomer, isUpdating, editDialogOpen]);

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
        const mostRecentJob = newJobs[0];
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
      // Note: You'll need to implement delete function in db.customers
      // const { error } = await db.customers.delete(customerToDelete.id);
      
      // For now, just show success message
      toast.success(`Customer ${customerToDelete.customer_id || customerToDelete.customerId} deleted successfully`);
      
      // Remove from local state
      setCustomers(customers.filter(c => c.id !== customerToDelete.id));
      setDeleteDialogOpen(false);
      setCustomerToDelete(null);
    } catch (error) {
      toast.error('Failed to delete customer');
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
      has_prefilter: (customer as any).has_prefilter ?? null,
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
        
        // If location already has a value, use it (don't overwrite)
        if (existingLocation && existingLocation.trim().length > 0) {
          return existingLocation;
        }
        
        // If location is empty, extract from complete address using our matching logic
        // Build full address from all available address fields
        let addressParts = [
          customer.address?.street,
          customer.address?.area,
          customer.address?.city,
          customer.address?.state,
          customer.address?.pincode
        ].filter(Boolean);
        
        // Also check if there's a formatted address in location (but avoid duplicates)
        if (customer.location?.formattedAddress && 
            !customer.location.formattedAddress.includes('google.com/maps') &&
            !customer.location.formattedAddress.includes('localhost')) {
          const formattedAddr = customer.location.formattedAddress.trim();
          // Check if formattedAddress is already included in any of the address parts
          const isDuplicate = addressParts.some(part => {
            if (!part) return false;
            const partStr = String(part).toLowerCase();
            const formattedStr = formattedAddr.toLowerCase();
            // Check if one contains the other (to avoid duplicates)
            return partStr.includes(formattedStr) || formattedStr.includes(partStr);
          });
          if (!isDuplicate && formattedAddr.length > 0) {
            addressParts.push(formattedAddr);
          }
        }
        
        // Remove exact duplicates and join
        const uniqueAddressParts = Array.from(new Set(addressParts.map(String).filter(Boolean)));
        const completeAddress = uniqueAddressParts.join(', ') || '';
        
        // Extract location from the full address using our matching logic with Bangalore areas
        const extractedLocation = extractLocationFromAddressString(completeAddress);
        
        // Debug logging
        if (completeAddress) {
          if (extractedLocation) {
            console.log('✅ Extracted location from complete address (location was empty):', extractedLocation, 'from:', completeAddress);
          } else {
            console.log('⚠️ Could not extract location from complete address:', completeAddress);
          }
        }
        
        // Return extracted location if found, otherwise empty string
        return extractedLocation || '';
      })(),
      custom_time: customer.customTime || (customer as any).custom_time || '',
      address: {
        street: [
          customer.address?.street,
          customer.address?.area,
          customer.address?.city,
          customer.address?.state,
          customer.address?.pincode
        ].filter(Boolean).join(', ') || '',
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
        // Get existing location from database
        const existingLocation = (customer as any).visible_address || (customer.address as any)?.visible_address || '';
        
        // If location already has a value, use it (don't overwrite)
        if (existingLocation && existingLocation.trim().length > 0) {
          return existingLocation;
        }
        
        // If location is empty, extract from complete address using our matching logic
        // Build full address from all available address fields
        let addressParts = [
          customer.address?.street,
          customer.address?.area,
          customer.address?.city,
          customer.address?.state,
          customer.address?.pincode
        ].filter(Boolean);
        
        // Also check if there's a formatted address in location (but avoid duplicates)
        if (customer.location?.formattedAddress && 
            !customer.location.formattedAddress.includes('google.com/maps') &&
            !customer.location.formattedAddress.includes('localhost')) {
          const formattedAddr = customer.location.formattedAddress.trim();
          // Check if formattedAddress is already included in any of the address parts
          const isDuplicate = addressParts.some(part => {
            if (!part) return false;
            const partStr = String(part).toLowerCase();
            const formattedStr = formattedAddr.toLowerCase();
            // Check if one contains the other (to avoid duplicates)
            return partStr.includes(formattedStr) || formattedStr.includes(partStr);
          });
          if (!isDuplicate && formattedAddr.length > 0) {
            addressParts.push(formattedAddr);
          }
        }
        
        // Remove exact duplicates and join
        const uniqueAddressParts = Array.from(new Set(addressParts.map(String).filter(Boolean)));
        const completeAddress = uniqueAddressParts.join(', ') || '';
        
        // Extract location from the full address using our matching logic with Bangalore areas
        const extractedLocation = extractLocationFromAddressString(completeAddress);
        
        // Debug logging
        if (completeAddress) {
          if (extractedLocation) {
            console.log('✅ Extracted location from complete address (location was empty):', extractedLocation, 'from:', completeAddress);
          } else {
            console.log('⚠️ Could not extract location from complete address:', completeAddress);
          }
        }
        
        // Return extracted location if found, otherwise empty string
        return extractedLocation || '';
      })(),
      custom_time: customer.customTime || (customer as any).custom_time || '',
      address: {
        street: [
          customer.address?.street,
          customer.address?.area,
          customer.address?.city,
          customer.address?.state,
          customer.address?.pincode
        ].filter(Boolean).join(', ') || '',
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
    hasUnsavedChangesRef.current = false;
    locationManuallyEditedRef.current = false; // Reset flag when opening edit dialog
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
        visible_address: editFormData.visible_address ? editFormData.visible_address.substring(0, 20) : '',
        custom_time: editFormData.custom_time || null,
        address: updatedAddress,
        location: updatedLocation
      };

      console.log('Update payload:', updateData);

      const { data: updatedCustomerFromDb, error } = await db.customers.update(editingCustomer.id, updateData);

      if (error) {
        console.error('Database update error:', error);
        throw new Error(error.message);
      }
      
      console.log('✅ Updated customer from DB:', updatedCustomerFromDb);
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

  const handleEditFormChange = (field: string, value: string | string[]) => {
    setEditFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Auto-extract location when edit dialog opens or address changes
  // Always try to extract when address changes, but only update if user hasn't manually edited
  useEffect(() => {
    // Only run when edit dialog is open
    if (!editDialogOpen) return;
    
    const address = editFormData?.address?.street || '';
    const currentLocation = editFormData?.visible_address || '';
    
    // Always try to extract when address changes (if user hasn't manually edited)
    if (address && address.trim().length > 0 && !locationManuallyEditedRef.current) {
      const extracted = extractLocationFromAddressString(address);
      if (extracted) {
        // Always update location if we found a match (even if location already has a value)
        // This ensures location stays in sync with address changes
        if (currentLocation !== extracted) {
          handleEditFormChange('visible_address', extracted);
          console.log('✅ Auto-extracted location from address:', extracted, 'from:', address);
        }
      } else {
        // If we couldn't extract and there's an old location, clear it
        // This ensures location doesn't stay when address changes to something that doesn't match
        if (currentLocation && currentLocation.trim().length > 0) {
          handleEditFormChange('visible_address', '');
          console.log('⚠️ Could not extract location from new address, cleared old location:', address);
        } else if (address) {
          // Only log if we couldn't extract and location is already empty
          console.log('⚠️ Could not extract location from complete address:', address);
        }
      }
    }
  }, [editDialogOpen, editFormData?.address?.street]);

  // Force extraction when dialog first opens
  useEffect(() => {
    if (editDialogOpen && editingCustomer && !locationManuallyEditedRef.current) {
      // Small delay to ensure form data is set
      const timer = setTimeout(() => {
        const address = editFormData?.address?.street || '';
        const currentLocation = editFormData?.visible_address || '';
        
        if (address && address.trim().length > 0) {
          const extracted = extractLocationFromAddressString(address);
          if (extracted && (!currentLocation || currentLocation !== extracted)) {
            handleEditFormChange('visible_address', extracted);
            console.log('✅ Force-extracted location on dialog open:', extracted, 'from:', address);
          }
        }
      }, 200);
      
      return () => clearTimeout(timer);
    }
  }, [editDialogOpen, editingCustomer?.id]);

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
    if (field === 'street' && value && !locationManuallyEditedRef.current) {
      // Small delay to ensure state is updated
      setTimeout(() => {
        const extracted = extractLocationFromAddressString(value);
        if (extracted) {
          setEditFormData(prev => ({
            ...prev,
            visible_address: extracted
          }));
          console.log('✅ Auto-extracted location from changed address:', extracted, 'from:', value);
        } else {
          // If extraction fails, clear old location if it exists
          setEditFormData(prev => {
            if (prev.visible_address && prev.visible_address.trim().length > 0) {
              console.log('⚠️ Could not extract location from new address, clearing old location');
              return {
                ...prev,
                visible_address: ''
              };
            }
            return prev;
          });
        }
      }, 100);
    }
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
      if (window.google && window.google.maps && window.google.maps.DistanceMatrixService) {
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
          if (window.google && window.google.maps && window.google.maps.DistanceMatrixService) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);

        // Timeout after 10 seconds
        setTimeout(() => {
          clearInterval(checkInterval);
          if (window.google && window.google.maps && window.google.maps.DistanceMatrixService) {
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
          if (window.google && window.google.maps && window.google.maps.DistanceMatrixService) {
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
      if (!window.google?.maps?.DistanceMatrixService) {
        throw new Error('DistanceMatrixService not available');
      }

      console.log('Creating DistanceMatrixService...');
      const distanceMatrix = new window.google.maps.DistanceMatrixService();
      
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
      const tryCalculateDistance = (travelMode: google.maps.TravelMode, modeName: string, isRetry: boolean = false) => {
        const originCoords = { lat: Number(origin.lat), lng: Number(origin.lng) };
        const destCoords = { lat: Number(destination.lat), lng: Number(destination.lng) };
        
        console.log(`Trying ${modeName} mode:`, { origin: originCoords, destination: destCoords });
        
        distanceMatrix.getDistanceMatrix(
          {
            origins: [originCoords],
            destinations: [destCoords],
            travelMode: travelMode,
            unitSystem: window.google.maps.UnitSystem.METRIC,
          },
          (response, status) => {
            console.log(`Distance Matrix callback (${modeName}):`, { status, response });
            
            if (status === window.google.maps.DistanceMatrixStatus.OK && response) {
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
      
      setEditFormData(prev => ({
        ...prev,
        location: {
          ...prev.location,
          latitude: coords.latitude,
          longitude: coords.longitude,
          formattedAddress: address || prev.address.street || ''
        },
        address: {
          ...prev.address,
          street: address || prev.address.street || ''
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
        
        setEditFormData(prev => ({
          ...prev,
          location: {
            ...prev.location,
            latitude: coords.latitude,
            longitude: coords.longitude,
            formattedAddress: address || prev.address.street || ''
          },
          address: {
            ...prev.address,
            street: address || prev.address.street || ''
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
          if (window.google && window.google.maps && window.google.maps.Geocoder) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);

        // Timeout after 10 seconds
        setTimeout(() => {
          clearInterval(checkInterval);
          if (window.google && window.google.maps && window.google.maps.Geocoder) {
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
          if (window.google && window.google.maps && window.google.maps.Geocoder) {
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
    if (!validateStep(4)) return; // Validate final step
    
    await createCustomer();
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
      } else if (newJobFormData.scheduled_time_slot === 'FLEXIBLE') {
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

      const { data: newJob, error } = await db.jobs.create(jobData);
      
      if (error) {
        throw new Error(error.message);
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
        if (assignedTechnician) {
          const notification = createJobAssignedNotification(
            newJob.job_number,
            selectedCustomerForJob.fullName,
            assignedTechnician.fullName,
            newJob.id,
            assignedTechnician.id
          );
          await sendNotification(notification);
        }
      }

      toast.success(`Job ${newJob.job_number} created successfully!`);
      
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
    if (serviceType && brand && modelData[serviceType]) {
      const brandKey = Object.keys(modelData[serviceType]).find(key => 
        key.toLowerCase() === brand.toLowerCase()
      );
      if (brandKey && modelData[serviceType][brandKey as keyof typeof modelData[serviceType]]) {
        localModels.push(...(modelData[serviceType][brandKey as keyof typeof modelData[serviceType]] || []));
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
      const extractPhotoUrls = (photos: any[]): string[] => {
        if (!Array.isArray(photos)) return [];
        return photos.map(photo => {
          if (typeof photo === 'string' && photo.trim() !== '') {
            return photo.trim();
          } else if (photo && typeof photo === 'object' && photo.secure_url) {
            return photo.secure_url;
          }
          return null;
        }).filter((url): url is string => {
          return url !== null && url !== '';
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
                    req.bill_photos.forEach((photo: string) => {
                      if (photo && typeof photo === 'string' && photo.trim() !== '') {
                        photoSet.add(photo.trim());
                      }
                    });
                  }
                  if (req.payment_photos && Array.isArray(req.payment_photos)) {
                    req.payment_photos.forEach((photo: string) => {
                      if (photo && typeof photo === 'string' && photo.trim() !== '') {
                        photoSet.add(photo.trim());
                      }
                    });
                  }
                });
              } else if (typeof requirements === 'object' && requirements !== null) {
                if (requirements.bill_photos && Array.isArray(requirements.bill_photos)) {
                  requirements.bill_photos.forEach((photo: string) => {
                    if (photo && typeof photo === 'string' && photo.trim() !== '') {
                      photoSet.add(photo.trim());
                    }
                  });
                }
                if (requirements.payment_photos && Array.isArray(requirements.payment_photos)) {
                  requirements.payment_photos.forEach((photo: string) => {
                    if (photo && typeof photo === 'string' && photo.trim() !== '') {
                      photoSet.add(photo.trim());
                    }
                  });
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
      console.log(`Total unique photos found: ${uniquePhotos.length}`);

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

            const { error: createError } = await db.jobs.create(jobData);
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
      setCurrentStep(prev => Math.min(prev + 1, 4));
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



  // Job assignment functions
  const handleAssignJob = async (job: Job) => {
    setJobToAssign(job);
    setSelectedTechnicianId('');
    setSelectedTechnicianIds([]);
    setAssignmentType('direct');
    setTechnicianDistances([]);
    setAssignJobDialogOpen(true);

    // Reload technicians to get latest location data
    await reloadTechnicians();

    // Don't calculate distances automatically - user will click button to calculate
  };

  // Calculate distances from job location to all technicians
  const calculateDistancesForJob = async (job: Job) => {
    // Get job location
    const jobLocation = (job.serviceLocation as any) || (job.customer as any)?.location;
    
    if (!jobLocation?.latitude || !jobLocation?.longitude) {
      console.warn('⚠️ Job location not available for distance calculation');
      return;
    }

    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      console.warn('⚠️ Google Maps API key not configured');
      toast.warning('Google Maps API key not configured. Distance calculation disabled.');
      return;
    }

    // Log technicians with their locations
    console.log('🔍 Calculating distances for job:', {
      jobLocation: { lat: jobLocation.latitude, lng: jobLocation.longitude },
      technicians: technicians.map(t => ({
        name: t.fullName,
        id: t.id,
        hasCurrentLocation: !!t.currentLocation,
        hasCurrent_location: !!(t as any).current_location,
        currentLocation: t.currentLocation,
        current_location: (t as any).current_location,
        status: t.status,
        // Check raw data
        rawTech: t
      }))
    });

    setLoadingDistances(true);
    try {
      const distances = await calculateTechnicianDistances(
        {
          latitude: jobLocation.latitude,
          longitude: jobLocation.longitude,
        },
        technicians,
        apiKey
      );

      console.log('📏 Distance calculation results:', distances);
      setTechnicianDistances(distances);
    } catch (error) {
      console.error('❌ Error calculating distances:', error);
      toast.error('Failed to calculate distances. You can still assign manually.');
    } finally {
      setLoadingDistances(false);
    }
  };

  const handleSaveJobAssignment = async () => {
    if (!jobToAssign || !selectedTechnicianId) return;

    try {
      const { error } = await db.jobs.update(jobToAssign.id, {
        assigned_technician_id: selectedTechnicianId,
        status: 'ASSIGNED'
      });

      if (error) throw error;

      toast.success('Job assigned successfully');
      setAssignJobDialogOpen(false);
      setJobToAssign(null);
      setSelectedTechnicianId('');

      // Refresh jobs data
      await loadDashboardData();
    } catch (error) {
      toast.error('Failed to assign job');
    }
  };

  // New bulk assignment functions
  const handleBulkAssignJob = (job: Job) => {
    setJobToAssign(job);
    setSelectedTechnicianIds([]);
    setAssignmentType('bulk');
    setAssignJobDialogOpen(true);
  };

  const handleSaveBulkJobAssignment = async () => {
    if (!jobToAssign || selectedTechnicianIds.length === 0) return;

    try {
      setIsCreatingAssignmentRequests(true);

      // Create assignment requests for all selected technicians
      const requests = selectedTechnicianIds.map(technicianId => ({
        job_id: jobToAssign.id,
        technician_id: technicianId,
        assigned_by: user?.id,
        assigned_at: new Date().toISOString(),
        status: 'PENDING' as const
      }));

      const { data, error } = await db.jobAssignmentRequests.createMultiple(requests);

      if (error) throw error;

      // Send notifications to all technicians
      const job = jobToAssign;
      const customer = job.customer;
      
      for (const technicianId of selectedTechnicianIds) {
        const technician = technicians.find(t => t.id === technicianId);
        if (technician) {
          const notification = createJobAssignmentRequestNotification(
            job.job_number,
            customer?.full_name || 'Customer',
            technician.fullName,
            job.id,
            technician.id,
            data?.find(r => r.technician_id === technicianId)?.id || ''
          );
          await sendNotification(notification);
        }
      }

      toast.success(`Job assignment requests sent to ${selectedTechnicianIds.length} technician${selectedTechnicianIds.length > 1 ? 's' : ''}`);
      setAssignJobDialogOpen(false);
      setJobToAssign(null);
      setSelectedTechnicianIds([]);

      // Refresh jobs data
      await loadDashboardData();
    } catch (error) {
      toast.error('Failed to send assignment requests');
    } finally {
      setIsCreatingAssignmentRequests(false);
    }
  };


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
    setSelectedTechnicianForReassign(job.assigned_technician_id || job.assignedTechnicianId || '');
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
    } catch (error) {
      toast.error('Failed to reassign job');
    }
  };

  const handleEditJob = (job: Job) => {
    setJobToEdit(job);
    
    // Determine if service sub type is custom
    const serviceSubType = job.service_sub_type || job.serviceSubType || 'Installation';
    const isCustomSubType = !['Installation', 'Reinstallation', 'Service', 'Repair', 'Other'].includes(serviceSubType);
    
    // Determine if time slot is custom
    const timeSlot = job.scheduled_time_slot || job.scheduledTimeSlot || 'MORNING';
    const isCustomTimeSlot = !['MORNING', 'AFTERNOON', 'EVENING'].includes(timeSlot);
    
    // Convert custom time to HH:MM format for time picker
    let customTimeValue = '';
    if (isCustomTimeSlot && timeSlot) {
      // Try to parse various time formats and convert to HH:MM
      const timeStr = timeSlot.toString();
      if (timeStr.includes(':')) {
        // Already in HH:MM format
        customTimeValue = timeStr;
      } else if (timeStr.includes('AM') || timeStr.includes('PM')) {
        // Convert 12-hour format to 24-hour format
        const time = new Date(`2000-01-01 ${timeStr}`);
        if (!isNaN(time.getTime())) {
          customTimeValue = time.toTimeString().slice(0, 5);
        }
      }
    }
    
    // Extract lead_source from requirements
    let leadSource = 'Direct call';
    let leadSourceCustom = '';
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
            leadSource = req.lead_source === 'Other' ? 'Other' : req.lead_source;
            leadSourceCustom = req.lead_source === 'Other' ? (req.lead_source_custom || '') : '';
          }
        } else if (reqs && typeof reqs === 'object' && reqs.lead_source) {
          leadSource = reqs.lead_source === 'Other' ? 'Other' : reqs.lead_source;
          leadSourceCustom = reqs.lead_source === 'Other' ? (reqs.lead_source_custom || '') : '';
        }
      }
    } catch (e) {
    }

    setEditJobFormData({
      serviceType: (job.service_type || job.serviceType || 'RO') as 'RO' | 'SOFTENER',
      serviceSubType: isCustomSubType ? 'Custom' : serviceSubType,
      serviceSubTypeCustom: isCustomSubType ? serviceSubType : '',
      description: job.description || '',
      scheduledDate: job.scheduled_date || job.scheduledDate || '',
      scheduledTimeSlot: isCustomTimeSlot ? 'CUSTOM' : (timeSlot as 'MORNING' | 'AFTERNOON' | 'EVENING'),
      scheduledTimeCustom: customTimeValue,
      lead_source: leadSource,
      lead_source_custom: leadSourceCustom
    });
    setEditJobDialogOpen(true);
  };

  const handleEditJobSubmit = async () => {
    if (!jobToEdit) return;

    try {
      // Convert time picker value to readable format for custom time
      let timeSlotValue = editJobFormData.scheduledTimeSlot;
      let customTimeInRequirements = null;
      
      if (editJobFormData.scheduledTimeSlot === 'CUSTOM' && editJobFormData.scheduledTimeCustom) {
        // Store custom time in requirements and convert to time slot for DB
        customTimeInRequirements = editJobFormData.scheduledTimeCustom;
        // Convert HH:MM to time slot based on hour
        const [hours, minutes] = editJobFormData.scheduledTimeCustom.split(':');
        const hour24 = parseInt(hours);
        if (hour24 < 13) {
          timeSlotValue = 'MORNING';
        } else if (hour24 < 18) {
          timeSlotValue = 'AFTERNOON';
        } else {
          timeSlotValue = 'EVENING';
        }
      } else if (editJobFormData.scheduledTimeSlot === 'FLEXIBLE') {
        timeSlotValue = 'MORNING'; // Default to MORNING for flexible, store in requirements
      }

      // Get existing requirements or create new one
      let requirements = (jobToEdit as any).requirements || [];
      if (typeof requirements === 'string') {
        try {
          requirements = JSON.parse(requirements);
        } catch (e) {
          requirements = [];
        }
      }
      if (!Array.isArray(requirements)) {
        requirements = [requirements];
      }
      
      // Update or add lead_source and custom_time
      const leadSourceValue = editJobFormData.lead_source === 'Other' 
        ? (editJobFormData.lead_source_custom || 'Other')
        : editJobFormData.lead_source;
      
      // Find existing requirement object or create new one
      let reqObj = requirements.find((r: any) => r && typeof r === 'object') || {};
      reqObj.lead_source = leadSourceValue;
      if (editJobFormData.lead_source === 'Other' && editJobFormData.lead_source_custom) {
        reqObj.lead_source_custom = editJobFormData.lead_source_custom;
      }
      if (customTimeInRequirements) {
        reqObj.custom_time = customTimeInRequirements;
      }
      if (editJobFormData.scheduledTimeSlot === 'FLEXIBLE') {
        reqObj.flexible_time = true;
      }
      
      // Replace requirements array with updated object
      requirements = [reqObj];

      const { error } = await db.jobs.update(jobToEdit.id, {
        service_type: editJobFormData.serviceType,
        service_sub_type: editJobFormData.serviceSubType === 'Custom' ? editJobFormData.serviceSubTypeCustom : editJobFormData.serviceSubType,
        description: editJobFormData.description,
        scheduled_date: editJobFormData.scheduledDate,
        scheduled_time_slot: timeSlotValue,
        requirements: requirements
      });

      if (error) {
        toast.error('Failed to update job');
        return;
      }

      // Update local state
      setJobs(prev => prev.map(job => 
        job.id === jobToEdit.id 
          ? { 
              ...job, 
              serviceType: editJobFormData.serviceType,
              serviceSubType: editJobFormData.serviceSubType === 'Custom' ? editJobFormData.serviceSubTypeCustom : editJobFormData.serviceSubType,
              description: editJobFormData.description,
              scheduledDate: editJobFormData.scheduledDate,
              scheduledTimeSlot: timeSlotValue,
              requirements: requirements
            }
          : job
      ));

      toast.success('Job updated successfully');
      setEditJobDialogOpen(false);
      setJobToEdit(null);
    } catch (error) {
      toast.error('Failed to update job');
    }
  };

  const handleJobStatusUpdate = async (jobId: string, newStatus: string) => {
    try {
      const { error } = await db.jobs.update(jobId, { status: newStatus as 'PENDING' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'RESCHEDULED' });
      
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
          throw new Error(deleteError.message);
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
        })
        .select()
        .single();

      if (followUpError) {
        throw new Error(followUpError.message);
      }

      // If this is the first follow-up (no parent), update job status
      if (!followUpData.parentFollowUpId) {
        const { error: jobError } = await db.jobs.update(jobId, {
          status: 'FOLLOW_UP',
          follow_up_date: followUpData.followUpDate,
          follow_up_notes: followUpData.followUpReason,
          follow_up_scheduled_by: user?.id || 'admin',
          follow_up_scheduled_at: new Date().toISOString()
        });

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
                followUpNotes: followUpData.followUpReason + (followUpData.followUpNotes ? ` - ${followUpData.followUpNotes}` : ''),
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
      });

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
      });

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
  const calculateAMCEndDate = (agreementDate: string, years: number) => {
    if (!agreementDate) return;
    const startDate = new Date(agreementDate);
    const endDate = new Date(startDate);
    endDate.setFullYear(endDate.getFullYear() + years);
    // Subtract 1 day (AMC covers up to that date - 1 day)
    endDate.setDate(endDate.getDate() - 1);
    setAmcEndDate(endDate.toISOString().split('T')[0]);
  };

  // Handle job completion
  const handleCompleteJob = async (job: Job) => {
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
    setCompletionNotes('');
    setCompleteJobStep(1);
    setBillAmount('');
    setBillPhotos([]);
    // Set default AMC date to today
    const today = new Date().toISOString().split('T')[0];
    setAmcDateGiven(today);
    setAmcYears(1);
    // Calculate end date with default 1 year
    calculateAMCEndDate(today, 1);
    setAmcIncludesPrefilter(false);
    setHasAMC(false);
    setPaymentMode('');
    setCustomerHasPrefilter(null);
    setQrCodeType('');
    setSelectedQrCodeId('');
    setPaymentScreenshot('');

    setCompleteDialogOpen(true);
  };

  // Handle job completion submission
  const handleCompleteJobSubmit = async () => {
    if (!selectedJobForComplete) return;

    // Step 1: Bill Photo (optional) - move to step 2
    if (completeJobStep === 1) {
      setCompleteJobStep(2);
      return;
    }

    // Step 2: Bill Amount - validate and show confirmation
    if (completeJobStep === 2) {
      if (!billAmount || parseFloat(billAmount) <= 0) {
        toast.error('Please enter a valid bill amount');
        return;
      }
      // Show confirmation dialog
      setBillAmountConfirmOpen(true);
      return;
    }

    // Step 3: Payment Mode - validate and move to step 4 (payment screenshot) or step 5 (AMC)
    if (completeJobStep === 3) {
      if (!paymentMode) {
        toast.error('Please select a payment mode');
        return;
      }
      // If Cash, skip to step 5 (AMC)
      if (paymentMode === 'CASH') {
      setCompleteJobStep(5);
      return;
      }
      // If Online, need to check QR code selection, then go to payment screenshot step
      if (paymentMode === 'ONLINE') {
        if (!selectedQrCodeId) {
          toast.error('Please select a QR code');
          return;
        }
        setCompleteJobStep(4);
        return;
      }
    }

    // Step 4: Payment Screenshot (optional) - move to step 5 (AMC)
    if (completeJobStep === 4) {
      setCompleteJobStep(5);
      return;
    }

    // Step 5: AMC - move to step 6 (Prefilter)
    if (completeJobStep === 5) {
      setCompleteJobStep(6);
      return;
    }

    // On step 6, submit the form
    try {
      // Prepare update data
      // Map payment mode to database allowed values
      // Database allows: 'CASH', 'CARD', 'UPI', 'BANK_TRANSFER'
      // Frontend uses: 'CASH', 'ONLINE'
      let dbPaymentMethod: 'CASH' | 'CARD' | 'UPI' | 'BANK_TRANSFER' | null = null;
      if (paymentMode === 'CASH') {
        dbPaymentMethod = 'CASH';
      } else if (paymentMode === 'ONLINE') {
        // Map ONLINE to UPI (most common online payment method)
        dbPaymentMethod = 'UPI';
      }
      
      const updateData: any = {
        status: 'COMPLETED',
        end_time: new Date().toISOString(),
        completion_notes: completionNotes.trim(),
        completed_by: user?.id || 'admin',
        completed_at: new Date().toISOString(),
        actual_cost: parseFloat(billAmount) || 0,
        payment_amount: parseFloat(billAmount) || 0,
        payment_method: dbPaymentMethod || null,
        customer_has_prefilter: customerHasPrefilter,
      };

      // Handle requirements - merge bill photos and AMC info
      const currentRequirements = selectedJobForComplete.requirements || [];
      let requirements: any[] = [];
      
      if (Array.isArray(currentRequirements)) {
        requirements = [...currentRequirements];
      } else if (typeof currentRequirements === 'string') {
        try {
          requirements = JSON.parse(currentRequirements);
          if (!Array.isArray(requirements)) {
            requirements = [];
          }
        } catch {
          requirements = [];
        }
      }

      // Remove existing bill_photos, payment_photos, qr_photos and amc_info entries
      requirements = requirements.filter((req: any) => !req.bill_photos && !req.payment_photos && !req.qr_photos && !req.amc_info);

      // Add bill photos if any
      if (billPhotos.length > 0) {
        requirements.push({ bill_photos: billPhotos });
      }

      // Add QR code data if payment mode is ONLINE
      if (paymentMode === 'ONLINE' && selectedQrCodeId) {
        const qrPhotos: any = {
          qr_code_type: qrCodeType,
          selected_qr_code_id: selectedQrCodeId,
          payment_screenshot: paymentScreenshot || null
        };
        
        // Add selected QR code URL
        if (selectedQrCodeId.startsWith('common_')) {
          const qrId = selectedQrCodeId.replace('common_', '');
          const selectedQr = commonQrCodes.find(qr => qr.id === qrId);
          if (selectedQr) {
            qrPhotos.selected_qr_code_url = selectedQr.qrCodeUrl;
            qrPhotos.selected_qr_code_name = selectedQr.name;
          }
        } else if (selectedQrCodeId.startsWith('technician_')) {
          const techId = selectedQrCodeId.replace('technician_', '');
          const selectedTech = technicians.find(t => t.id === techId);
          if (selectedTech && (selectedTech as any).qrCode) {
            qrPhotos.selected_qr_code_url = (selectedTech as any).qrCode;
            qrPhotos.selected_qr_code_name = selectedTech.fullName || 'Technician';
          }
        }
        
        requirements.push({ qr_photos: qrPhotos });
      }

      // Add AMC info if provided
      if (hasAMC && amcDateGiven && amcEndDate) {
        requirements.push({ 
          amc_info: {
            date_given: amcDateGiven,
            end_date: amcEndDate,
            years: amcYears,
            includes_prefilter: amcIncludesPrefilter
          }
        });
      }

      // Update requirements if we have any changes
      if (billPhotos.length > 0 || (paymentMode === 'ONLINE' && selectedQrCodeId) || (hasAMC && amcDateGiven && amcEndDate)) {
        updateData.requirements = JSON.stringify(requirements);
      }

      const { error } = await db.jobs.update(selectedJobForComplete.id, updateData);

      if (error) {
        throw new Error(error.message);
      }

      // Update local state
      setJobs(prev => prev.map(job => 
        job.id === selectedJobForComplete.id ? { 
          ...job, 
          status: 'COMPLETED',
          end_time: new Date().toISOString(),
          completionNotes: completionNotes.trim(),
          completedBy: user?.id || 'admin',
          completedAt: new Date().toISOString(),
          actual_cost: parseFloat(billAmount) || 0,
          payment_amount: parseFloat(billAmount) || 0,
        } : job
      ));

      setCustomerJobs(prev => {
        const updated = { ...prev };
        Object.keys(updated).forEach(customerId => {
          updated[customerId] = updated[customerId].map(job => 
            job.id === selectedJobForComplete.id ? { 
              ...job, 
              status: 'COMPLETED',
              end_time: new Date().toISOString(),
              completionNotes: completionNotes.trim(),
              completedBy: user?.id || 'admin',
              completedAt: new Date().toISOString(),
              actual_cost: parseFloat(billAmount) || 0,
              payment_amount: parseFloat(billAmount) || 0,
            } : job
          );
        });
        return updated;
      });

      toast.success('Job completed successfully');
      setCompleteDialogOpen(false);
      setSelectedJobForComplete(null);
      setCompletionNotes('');
      setCompleteJobStep(1);
      setBillAmount('');
      setBillPhotos([]);
      setAmcDateGiven(new Date().toISOString().split('T')[0]);
      setAmcEndDate('');
      setAmcYears(1);
      setAmcIncludesPrefilter(false);
      setHasAMC(false);
      setPaymentMode('');
      setCustomerHasPrefilter(null);
      setQrCodeType('');
      setSelectedQrCodeId('');
      setTechnicianQrCode('');
      setTechnicianName('');
      setPaymentScreenshot('');
      setPaymentMode('');
      setCustomerHasPrefilter(null);
      setQrCodeType('');
      setSelectedQrCodeId('');
      setTechnicianQrCode('');
      setTechnicianName('');
      setPaymentScreenshot('');
      setCustomerQrPhotos([]);
    } catch (error) {
      toast.error('Failed to complete job');
    }
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
    if (!selectedPhoto || !selectedJobPhotos) return;
    const newIndex = selectedPhoto.index > 0 ? selectedPhoto.index - 1 : selectedJobPhotos.photos.length - 1;
    setSelectedPhoto({ 
      url: selectedJobPhotos.photos[newIndex], 
      index: newIndex, 
      total: selectedJobPhotos.photos.length 
    });
  };

  // Navigate to next photo
  const goToNextPhoto = () => {
    if (!selectedPhoto || !selectedJobPhotos) return;
    const newIndex = selectedPhoto.index < selectedJobPhotos.photos.length - 1 ? selectedPhoto.index + 1 : 0;
    setSelectedPhoto({ 
      url: selectedJobPhotos.photos[newIndex], 
      index: newIndex, 
      total: selectedJobPhotos.photos.length 
    });
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

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      'PENDING': { color: 'bg-yellow-100 text-yellow-800', icon: Clock },
      'ASSIGNED': { color: 'bg-blue-100 text-blue-800', icon: Wrench },
      'IN_PROGRESS': { color: 'bg-orange-100 text-orange-800', icon: Wrench },
      'COMPLETED': { color: 'bg-green-100 text-green-800', icon: CheckCircle },
      'CANCELLED': { color: 'bg-red-100 text-red-800', icon: AlertCircle },
      'FOLLOW_UP': { color: 'bg-indigo-100 text-indigo-800', icon: CalendarPlus },
      'DENIED': { color: 'bg-red-100 text-red-800', icon: XCircle },
      'ACTIVE': { color: 'bg-green-100 text-green-800', icon: CheckCircle },
      'INACTIVE': { color: 'bg-gray-100 text-gray-800', icon: AlertCircle },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig['PENDING'];
    const Icon = config.icon;

    return (
      <Badge className={`${config.color} border-0`}>
        <Icon className="w-3 h-3 mr-1" />
        {status}
      </Badge>
    );
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
      upcomingJobs: customerJobs.filter(job => ['PENDING', 'ASSIGNED', 'IN_PROGRESS'].includes(job.status)),                                                    
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
        allJobs.some(job => ['PENDING', 'ASSIGNED', 'IN_PROGRESS'].includes(job.status))                                                                        
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
          upcomingJobs: allJobs.filter(job => ['PENDING', 'ASSIGNED', 'IN_PROGRESS'].includes(job.status)),
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
        allJobs.some(job => ['DENIED', 'CANCELLED'].includes(job.status))
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
    : filteredCustomers.map(customer => {
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

  const pendingJobs = jobs.filter(job => job.status === 'PENDING');
  const assignedJobs = jobs.filter(job => job.status === 'ASSIGNED');
  const inProgressJobs = jobs.filter(job => job.status === 'IN_PROGRESS');
  const completedJobs = jobs.filter(job => job.status === 'COMPLETED');
  
  // New stats for the dashboard cards
  const ongoingJobs = jobs.filter(job => ['PENDING', 'ASSIGNED', 'IN_PROGRESS'].includes(job.status));
  const followupJobs = jobs.filter(job => ['FOLLOW_UP', 'RESCHEDULED'].includes(job.status));
  const deniedJobs = jobs.filter(job => ['DENIED', 'CANCELLED'].includes(job.status));

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
              variant="outline"
              onClick={handleHideGSTInvoices}
              className="flex items-center gap-2"
            >
              ← Back to Dashboard
            </Button>
          </div>
          <GSTInvoicesPage />
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
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">Admin Dashboard</h1>
              <p className="text-sm sm:text-base text-gray-600">Manage customers, jobs, and system operations</p>
            </div>
            <div className="flex gap-3 flex-wrap">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="outline"
                    className="flex items-center gap-2"
                  >
                    <Settings className="w-4 h-4" />
                    Settings
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onClick={() => navigate('/settings')}>
                    <Settings className="w-4 h-4 mr-2" />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleShowGSTInvoices}>
                    <Receipt className="w-4 h-4 mr-2" />
                    GST Invoices
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
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

        {/* Search Bar */}
        <div className="mb-4 sm:mb-6">
          <div className="flex gap-2 w-full max-w-2xl">
            <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Search by customer ID, name, phone, or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={handleSearchKeyPress}
              className="pl-10 bg-white border-gray-300 focus:border-blue-500 focus:ring-blue-500 text-sm sm:text-base"
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
            {searchTerm && (
              <Button
                onClick={handleClearSearch}
                variant="outline"
                className="border-gray-300 hover:bg-gray-50"
              >
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">×</span>
                  <span className="hidden sm:inline">Clear</span>
                </div>
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
        <div className="grid grid-cols-2 gap-3 mb-6 sm:grid-cols-4 sm:gap-6">
          <Card 
            className={`border-2 p-3 sm:p-6 cursor-pointer transition-all hover:shadow-md ${
              statusFilter === 'ONGOING' 
                ? 'bg-blue-50 border-blue-500 shadow-md' 
                : 'bg-white border-gray-200 hover:border-gray-300'
            }`}
            onClick={() => setStatusFilter('ONGOING')}
          >
            <div className="flex items-center justify-between mb-2">
              <Wrench className={`h-5 w-5 sm:h-4 sm:w-4 ${statusFilter === 'ONGOING' ? 'text-blue-600' : 'text-blue-600'}`} />
              <div className="text-right">
                <div className={`text-lg font-bold sm:text-2xl ${statusFilter === 'ONGOING' ? 'text-blue-900' : 'text-gray-900'}`}>
                  {jobCounts.ongoing}
                </div>
                <p className="text-xs text-gray-500">Ongoing</p>
              </div>
            </div>
            <p className="text-xs text-gray-500">
                {pendingJobs.length} pending, {inProgressJobs.length} in progress
              </p>
          </Card>

          <Card 
            className={`border-2 p-3 sm:p-6 cursor-pointer transition-all hover:shadow-md ${
              statusFilter === 'RESCHEDULED' 
                ? 'bg-indigo-50 border-indigo-500 shadow-md' 
                : 'bg-white border-gray-200 hover:border-gray-300'
            }`}
            onClick={() => setStatusFilter('RESCHEDULED')}
          >
            <div className="flex items-center justify-between mb-2">
              <CalendarPlus className={`h-5 w-5 sm:h-4 sm:w-4 ${statusFilter === 'RESCHEDULED' ? 'text-indigo-600' : 'text-indigo-600'}`} />
              <div className="text-right">
                <div className={`text-lg font-bold sm:text-2xl ${statusFilter === 'RESCHEDULED' ? 'text-indigo-900' : 'text-gray-900'}`}>
                  {jobCounts.followup}
                </div>
                <p className="text-xs text-gray-500">Followup</p>
              </div>
            </div>
            <p className="text-xs text-gray-500">
                Jobs requiring follow-up
              </p>
          </Card>

          <Card 
            className={`border-2 p-3 sm:p-6 cursor-pointer transition-all hover:shadow-md ${
              statusFilter === 'CANCELLED' 
                ? 'bg-red-50 border-red-500 shadow-md' 
                : 'bg-white border-gray-200 hover:border-gray-300'
            }`}
            onClick={() => setStatusFilter('CANCELLED')}
          >
            <div className="flex items-center justify-between mb-2">
              <XCircle className={`h-5 w-5 sm:h-4 sm:w-4 ${statusFilter === 'CANCELLED' ? 'text-red-600' : 'text-red-600'}`} />
              <div className="text-right">
                <div className={`text-lg font-bold sm:text-2xl ${statusFilter === 'CANCELLED' ? 'text-red-900' : 'text-gray-900'}`}>
                  {jobCounts.denied}
                </div>
                <p className="text-xs text-gray-500">Denied</p>
              </div>
            </div>
            <p className="text-xs text-gray-500">
                Cancelled or denied jobs
              </p>
          </Card>

          <Card 
            className={`border-2 p-3 sm:p-6 cursor-pointer transition-all hover:shadow-md ${
              statusFilter === 'COMPLETED' 
                ? 'bg-green-50 border-green-500 shadow-md' 
                : 'bg-white border-gray-200 hover:border-gray-300'
            }`}
            onClick={() => setStatusFilter('COMPLETED')}
          >
            <div className="flex items-center justify-between mb-2">
              <CheckCircle className={`h-5 w-5 sm:h-4 sm:w-4 ${statusFilter === 'COMPLETED' ? 'text-green-600' : 'text-green-600'}`} />
              <div className="text-right">
                <div className={`text-lg font-bold sm:text-2xl ${statusFilter === 'COMPLETED' ? 'text-green-900' : 'text-gray-900'}`}>
                  {jobCounts.completed}
                </div>
                <p className="text-xs text-gray-500">Completed</p>
              </div>
            </div>
            <p className="text-xs text-gray-500">
                Successfully completed jobs
              </p>
          </Card>
        </div>

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
              <Card key={customer.id} className="bg-white border border-gray-200 hover:border-gray-300 hover:shadow-md transition-all duration-200 overflow-hidden mb-6 rounded-lg group">
                {/* Customer Profile Header - Mobile First Design */}
                <div className="bg-gray-50 p-4 border-b border-gray-200">
                  {/* Mobile Customer Info */}
                  <div className="mb-4 sm:hidden">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-6 h-6 bg-gray-600 rounded-sm flex items-center justify-center">
                        <div className="w-3 h-3 bg-white rounded-sm"></div>
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900 truncate flex-1">
                        {customer.fullName || 'Unknown Customer'}
                      </h3>
                      <div className="bg-gray-800 text-white px-2 py-1 rounded-md font-mono text-xs font-medium">
                        {customer.customerId || 'N/A'}
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons - Mobile Grid */}
                  <div className="grid grid-cols-2 gap-2 sm:hidden">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="flex items-center justify-center gap-2 h-10 bg-white hover:bg-gray-50 border-gray-300 hover:border-gray-400 text-gray-700 hover:text-gray-900 transition-all duration-200 rounded-md text-sm"
                      onClick={() => handleEditCustomer(customer)}
                    >
                      <Edit className="w-4 h-4" />
                      Edit Profile
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="flex items-center justify-center gap-2 h-10 bg-white hover:bg-gray-50 border-gray-300 hover:border-gray-400 text-gray-700 hover:text-gray-900 transition-all duration-200 rounded-md text-sm"
                      onClick={() => handleNewJob(customer)}
                    >
                      <Plus className="w-4 h-4" />
                      New Job
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="flex items-center justify-center gap-2 h-10 bg-white hover:bg-gray-50 border-gray-300 hover:border-gray-400 text-gray-700 hover:text-gray-900 transition-all duration-200 rounded-md text-sm"
                      onClick={() => handleViewPhotos(customer)}
                      disabled={isLoadingPhotos}
                    >
                      {isLoadingPhotos && selectedCustomerForPhotos?.customer_id === (customer.customer_id || customer.customerId) ? (
                        <div className="flex items-center gap-1">
                          <div className="w-2 h-2 bg-black rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                          <div className="w-2 h-2 bg-black rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                          <div className="w-2 h-2 bg-black rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                        </div>
                      ) : (
                        <Camera className="w-4 h-4" />
                      )}
                      Photos
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="flex items-center justify-center gap-2 h-10 bg-white hover:bg-gray-50 border-gray-300 hover:border-gray-400 text-gray-700 hover:text-gray-900 transition-all duration-200 rounded-md text-sm"
                      onClick={() => handleViewHistory(customer)}
                    >
                      <History className="w-4 h-4" />
                      History
                    </Button>
                    
                    {/* Mobile More Options Button - Opens Dialog */}
                    <div className="col-span-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="w-full flex items-center justify-center gap-2 h-10 bg-white hover:bg-gray-50 border-gray-300 hover:border-gray-400 text-gray-700 hover:text-gray-900 transition-all duration-200 rounded-md text-sm"
                        onClick={() => {
                          setMoreOptionsDialogOpen(prev => ({
                            ...prev,
                            [customer.id]: true
                          }));
                        }}
                      >
                        <MoreVertical className="w-4 h-4" />
                        More Options
                      </Button>
                      
                      {/* More Options Dialog */}
                      <Dialog 
                        open={moreOptionsDialogOpen[customer.id] || false}
                        onOpenChange={(open) => {
                          setMoreOptionsDialogOpen(prev => ({
                            ...prev,
                            [customer.id]: open
                          }));
                        }}
                      >
                        <DialogContent className="sm:max-w-md">
                          <DialogHeader>
                            <DialogTitle>More Options</DialogTitle>
                            <DialogDescription>
                              Choose an action for {customer.fullName || 'this customer'}
                            </DialogDescription>
                          </DialogHeader>
                          <div className="grid gap-2 py-4">
                            <Button 
                              variant="outline"
                              className="w-full justify-start h-auto py-3 px-4"
                              onClick={() => {
                                setMoreOptionsDialogOpen(prev => ({ ...prev, [customer.id]: false }));
                                handleGenerateBill(customer);
                              }}
                            >
                              <Receipt className="mr-3 h-5 w-5" />
                              <div className="text-left">
                                <div className="font-medium">Generate Bill</div>
                                <div className="text-xs text-muted-foreground">Create a bill for this customer</div>
                              </div>
                            </Button>
                            <Button 
                              variant="outline"
                              className="w-full justify-start h-auto py-3 px-4"
                              onClick={() => {
                                setMoreOptionsDialogOpen(prev => ({ ...prev, [customer.id]: false }));
                                handleGenerateQuotation(customer);
                              }}
                            >
                              <FileText className="mr-3 h-5 w-5" />
                              <div className="text-left">
                                <div className="font-medium">Generate Quotation</div>
                                <div className="text-xs text-muted-foreground">Create a quotation for this customer</div>
                              </div>
                            </Button>
                            <Button 
                              variant="outline"
                              className="w-full justify-start h-auto py-3 px-4"
                              onClick={() => {
                                setMoreOptionsDialogOpen(prev => ({ ...prev, [customer.id]: false }));
                                handleGenerateAMC(customer);
                              }}
                            >
                              <Star className="mr-3 h-5 w-5" />
                              <div className="text-left">
                                <div className="font-medium">Generate AMC</div>
                                <div className="text-xs text-muted-foreground">Create full AMC or share terms only</div>
                              </div>
                            </Button>
                            <Button 
                              variant="outline"
                              className="w-full justify-start h-auto py-3 px-4"
                              onClick={() => {
                                setMoreOptionsDialogOpen(prev => ({ ...prev, [customer.id]: false }));
                                handleGenerateTaxInvoice(customer);
                              }}
                            >
                              <Receipt className="mr-3 h-5 w-5" />
                              <div className="text-left">
                                <div className="font-medium">Generate Tax Invoice</div>
                                <div className="text-xs text-muted-foreground">Create a tax invoice with GST for this customer</div>
                              </div>
                            </Button>
                            <Button 
                              variant="outline"
                              className="w-full justify-start h-auto py-3 px-4"
                              onClick={() => {
                                setMoreOptionsDialogOpen(prev => ({ ...prev, [customer.id]: false }));
                                setSelectedCustomerForReport(customer);
                                setCustomerReportDialogOpen(true);
                              }}
                            >
                              <FileText className="mr-3 h-5 w-5" />
                              <div className="text-left">
                                <div className="font-medium">Reports</div>
                                <div className="text-xs text-muted-foreground">View customer reports</div>
                              </div>
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>

                  {/* Desktop Layout - Customer Info and Action Buttons in Same Row */}
                  <div className="hidden sm:flex sm:items-center sm:justify-between sm:gap-4">
                    {/* Customer Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 bg-gray-600 rounded-sm flex items-center justify-center">
                            <div className="w-2 h-2 bg-white rounded-sm"></div>
                          </div>
                          <h3 className="text-xl font-semibold text-gray-900 truncate">
                            {customer.fullName || 'Unknown Customer'}
                          </h3>
                          <div className="bg-gray-800 text-white px-2 py-1 rounded-md font-mono text-sm font-medium">
                            {customer.customerId || 'N/A'}
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Desktop Action Buttons */}
                    <div className="flex items-center gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="flex items-center gap-2 h-8 px-3 bg-white hover:bg-gray-50 border-gray-300 hover:border-gray-400 text-gray-700 hover:text-gray-900 transition-all duration-200 rounded-md text-xs"
                        onClick={() => handleEditCustomer(customer)}
                      >
                        <Edit className="w-3 h-3" />
                        Edit
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="flex items-center gap-2 h-8 px-3 bg-white hover:bg-gray-50 border-gray-300 hover:border-gray-400 text-gray-700 hover:text-gray-900 transition-all duration-200 rounded-md text-xs"
                        onClick={() => handleNewJob(customer)}
                      >
                        <Plus className="w-3 h-3" />
                        Job
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="flex items-center gap-2 h-8 px-3 bg-white hover:bg-gray-50 border-gray-300 hover:border-gray-400 text-gray-700 hover:text-gray-900 transition-all duration-200 rounded-md text-xs"
                        onClick={() => handleViewPhotos(customer)}
                        disabled={isLoadingPhotos}
                      >
                        {isLoadingPhotos && selectedCustomerForPhotos?.customer_id === (customer.customer_id || customer.customerId) ? (
                          <div className="flex items-center gap-0.5">
                            <div className="w-1.5 h-1.5 bg-black rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                            <div className="w-1.5 h-1.5 bg-black rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                            <div className="w-1.5 h-1.5 bg-black rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                          </div>
                        ) : (
                          <Camera className="w-3 h-3" />
                        )}
                        Photos
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="flex items-center gap-2 h-8 px-3 bg-white hover:bg-gray-50 border-gray-300 hover:border-gray-400 text-gray-700 hover:text-gray-900 transition-all duration-200 rounded-md text-xs"
                        onClick={() => handleViewHistory(customer)}
                      >
                        <History className="w-3 h-3" />
                        History
                      </Button>
                      
                      {/* Desktop 3 Dots Menu */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="flex items-center gap-2 h-8 px-3 bg-white hover:bg-gray-50 border-gray-300 hover:border-gray-400 text-gray-700 hover:text-gray-900 transition-all duration-200 rounded-md text-xs"
                          >
                            <MoreVertical className="w-3 h-3" />
                            More
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem onClick={() => handleGenerateBill(customer)}>
                            <Receipt className="mr-2 h-4 w-4" />
                            Generate Bill
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleGenerateQuotation(customer)}>
                            <FileText className="mr-2 h-4 w-4" />
                            Generate Quotation
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleGenerateAMC(customer)}>
                            <Star className="mr-2 h-4 w-4" />
                            Generate AMC / Share Terms
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleGenerateTaxInvoice(customer)}>
                            <Receipt className="mr-2 h-4 w-4" />
                            Generate Tax Invoice
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => {
                            setSelectedCustomerForReport(customer);
                            setCustomerReportDialogOpen(true);
                          }}>
                            <FileText className="mr-2 h-4 w-4" />
                            Reports
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>

                {/* Contact & Communication - Mobile First */}
                <div className="p-4 border-b border-gray-100">
                  <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                    {/* Phone */}
                    <div className="bg-white rounded-lg p-3 border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all duration-200">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                        <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          {/* Mobile: Show popup, Desktop: Direct call */}
                          <button 
                            onClick={() => {
                              // Show popup if there's alternate phone, otherwise direct call
                              if (customer.alternate_phone) {
                                handlePhoneClick(customer);
                              } else {
                                window.open(`tel:${customer.phone}`, '_self');
                              }
                            }}
                            className="cursor-pointer"
                          >
                            <Phone className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
                          </button>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-gray-900 truncate">{customer.phone}</div>
                          {/* Show only primary label, no alternate phone in display */}
                          <div className="text-xs text-gray-500">Primary</div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Email */}
                    {customer.email && customer.email.trim() && !customer.email.toLowerCase().includes('nomail') && !customer.email.toLowerCase().includes('no@mail') && (
                      <div className="bg-white rounded-lg p-3 border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all duration-200">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                          <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                            <a href={`mailto:${customer.email}`} className="cursor-pointer">
                              <Mail className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
                            </a>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-gray-900 truncate">{customer.email}</div>
                            <div className="text-xs text-gray-500">Email</div>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {/* WhatsApp */}
                    <div className="bg-white rounded-lg p-3 border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all duration-200">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                        <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <button
                            onClick={() => toast.info('WhatsApp integration coming soon')}
                            className="cursor-pointer"
                          >
                            <WhatsAppIcon className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
                          </button>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-gray-900">WhatsApp</div>
                          <div className="text-xs text-gray-500">Send Message</div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Location */}
                    <div className="bg-white rounded-lg p-3 border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all duration-200">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                        <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <button
                            onClick={() => {
                              // Open Google Maps
                              const googleLoc = (customer.location as any)?.googleLocation;
                              if (googleLoc && typeof googleLoc === 'string' && 
                                  (googleLoc.includes('google.com/maps') || googleLoc.includes('maps.app.goo.gl') || googleLoc.includes('goo.gl/maps')) &&
                                  !googleLoc.includes('localhost') && 
                                  !googleLoc.includes('127.0.0.1')) {
                                window.open(googleLoc, '_blank', 'noopener,noreferrer');
                              } else {
                                const location = extractCoordinates(customer.location);
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
                          <div className="text-sm font-semibold text-gray-900">
                            Location
                          </div>
                          <div className="text-xs">
                            {(customer.address as any)?.visible_address && String((customer.address as any).visible_address).trim() ? (
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  
                                  // First, get current location if not already set
                                  if (!currentLocation) {
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
                                      },
                                      (error) => {
                                        setIsGettingLocation(false);
                                        toast.error('Failed to get your location');
                                      },
                                      {
                                        enableHighAccuracy: true,
                                        timeout: 10000,
                                        maximumAge: 0,
                                      }
                                    );
                                  }
                                  
                                  // Open address dialog (don't calculate automatically)
                                  setAddressDialogOpen(prev => ({ ...prev, [customer.id]: true }));
                                }}
                                className="text-left text-black hover:text-gray-700 hover:underline transition-colors cursor-pointer font-medium w-full text-left"
                                title="Click to view full address and calculate distance"
                              >
                                {String((customer.address as any).visible_address).trim()}
                              </button>
                            ) : (
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  
                                  // First, get current location if not already set
                                  if (!currentLocation) {
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
                                      },
                                      (error) => {
                                        setIsGettingLocation(false);
                                        toast.error('Failed to get your location');
                                      },
                                      {
                                        enableHighAccuracy: true,
                                        timeout: 10000,
                                        maximumAge: 0,
                                      }
                                    );
                                  }
                                  
                                  // Open address dialog (don't calculate automatically)
                                  setAddressDialogOpen(prev => ({ ...prev, [customer.id]: true }));
                                }}
                                className="text-left text-black hover:text-gray-700 hover:underline transition-colors cursor-pointer font-medium w-full text-left"
                                title="Click to view full address and calculate distance"
                              >
                                Location
                              </button>
                            )}
                            {customerDistances[customer.id] && (
                              <div className="mt-1 text-xs font-medium text-black">
                                {customerDistances[customer.id].isCalculating ? (
                                  <span className="text-gray-400">Calculating...</span>
                                ) : (
                                  <>
                                    {customerDistances[customer.id].distance} • {customerDistances[customer.id].duration}
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

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
                          jobsToShow = allJobs.filter(job => ['PENDING', 'ASSIGNED', 'IN_PROGRESS'].includes(job.status));                                      
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
                        
                        const extractPhotoUrls = (photos: any[]) => {
                          return photos.map(photo => {
                            if (typeof photo === 'string') {
                              return photo;
                            } else if (photo && typeof photo === 'object' && photo.secure_url) {                                                                
                              return photo.secure_url;
                            }
                            return null;
                          }).filter(url => url !== null);
                        };
                        
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
                          <div key={job.id}>
                            {job.status === 'COMPLETED' && (
                              <div className="mt-4 mb-2">
                                <div className="flex flex-col sm:flex-row items-start gap-3 rounded-md border border-green-200 bg-green-50 px-3 py-2">
                                  <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                                  <div className="space-y-2 text-sm text-gray-900 flex-1 min-w-0">
                                    <div className="font-semibold text-green-900">
                                      Job Completed
                                    </div>
                                    
                                    {/* Bill Amount */}
                                    {(actualCost || paymentAmount) && (
                                      <div className="text-gray-700 break-words">
                                        <span className="text-gray-500 font-medium">Amount:</span> ₹{actualCost || paymentAmount}
                                      </div>
                                    )}
                                    
                                    {/* Payment Mode */}
                                    {paymentMethod && (
                                      <div className="text-gray-700 break-words">
                                        <span className="text-gray-500 font-medium">Payment Mode:</span> {
                                          paymentMethod === 'CASH' ? 'Cash' : 
                                          paymentMethod === 'ONLINE' || paymentMethod === 'UPI' || paymentMethod === 'CARD' || paymentMethod === 'BANK_TRANSFER' ? 'Online' : 
                                          paymentMethod
                                        }
                                      </div>
                                    )}
                                    
                                    {/* Payment Screenshot (if online) */}
                                    {(paymentMethod === 'ONLINE' || paymentMethod === 'UPI' || paymentMethod === 'CARD' || paymentMethod === 'BANK_TRANSFER') && paymentScreenshot && (
                                      <div className="text-gray-700 break-words">
                                        <span className="text-gray-500 font-medium">Payment Screenshot:</span>
                                        <a href={paymentScreenshot} target="_blank" rel="noopener noreferrer" className="ml-2 text-blue-600 hover:underline break-all">
                                          View Screenshot
                                        </a>
                                      </div>
                                    )}
                                    
                                    {/* QR Code Info (if online) */}
                                    {(paymentMethod === 'ONLINE' || paymentMethod === 'UPI' || paymentMethod === 'CARD' || paymentMethod === 'BANK_TRANSFER') && qrPhotos?.selected_qr_code_name && (
                                      <div className="text-gray-700 break-words">
                                        <span className="text-gray-500 font-medium">QR Code:</span> {qrPhotos.selected_qr_code_name}
                                      </div>
                                    )}
                                    
                                    {/* AMC Details */}
                                    {amcInfo && (
                                      <div className="mt-2 pt-2 border-t border-green-200">
                                        <div className="font-medium text-green-900 mb-1">AMC Details:</div>
                                        <div className="text-gray-700 space-y-1">
                                          <div>
                                            <span className="text-gray-500">Start Date:</span> {amcInfo.date_given ? new Date(amcInfo.date_given).toLocaleDateString('en-IN') : 'N/A'}
                                          </div>
                                          <div>
                                            <span className="text-gray-500">End Date:</span> {amcInfo.end_date ? new Date(amcInfo.end_date).toLocaleDateString('en-IN') : 'N/A'}
                                          </div>
                                          <div>
                                            <span className="text-gray-500">Duration:</span> {amcInfo.years || 1} {amcInfo.years === 1 ? 'year' : 'years'}
                                          </div>
                                          {amcInfo.includes_prefilter !== undefined && (
                                            <div>
                                              <span className="text-gray-500">Includes Prefilter:</span> {amcInfo.includes_prefilter ? 'Yes' : 'No'}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    )}
                                    
                                    {/* Completion Notes */}
                                    {completionNotes && (
                                      <div className="text-gray-700 mt-2 pt-2 border-t border-green-200 break-words">
                                        <span className="text-gray-500 font-medium">Notes:</span> {completionNotes}
                                      </div>
                                    )}
                                    
                                    {/* Bill Photos */}
                                    {billPhotos && Array.isArray(billPhotos) && billPhotos.length > 0 && (
                                      <div className="text-gray-700 mt-2 pt-2 border-t border-green-200">
                                        <span className="text-gray-500 font-medium">Bill Photos:</span> {billPhotos.length} photo{billPhotos.length !== 1 ? 's' : ''}
                                      </div>
                                    )}
                                    
                                    {/* Completed By */}
                                    {completedByName && (
                                      <div className="text-gray-700 mt-2 pt-2 border-t border-green-200 break-words">
                                        <span className="text-gray-500 font-medium">Completed By:</span> {completedByName}
                                      </div>
                                    )}
                                    
                                    {/* Completed At */}
                                    {formattedCompletedAt && (
                                      <div className="text-xs text-gray-500 mt-1 break-words">
                                        Completed on {formattedCompletedAt}
                                      </div>
                                    )}
                                    
                                    {/* Message Sent Status - Always show */}
                                    {(() => {
                                      const messageSent = requirements.some((r: any) => {
                                        if (r && typeof r === 'object') {
                                          return r.message_sent === true || r.message_sent === 'true';
                                        }
                                        return false;
                                      });
                                      const messageSentAt = requirements.find((r: any) => r?.message_sent_at)?.message_sent_at;
                                      
                                      if (messageSent) {
                                        return (
                                          <div className="text-xs text-green-600 mt-2 pt-2 border-t border-green-200 break-words font-medium">
                                            ✓ Message Sent{messageSentAt ? ` on ${new Date(messageSentAt).toLocaleString()}` : ''}
                                          </div>
                                        );
                                      } else {
                                        return (
                                          <div className="text-xs text-orange-600 mt-2 pt-2 border-t border-green-200 break-words font-medium">
                                            ⚠ Message Not Sent
                                          </div>
                                        );
                                      }
                                    })()}
                                  </div>
                                  <div className="flex flex-row sm:flex-col gap-2 mt-2 sm:mt-0 w-full sm:w-auto">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        setSelectedCompletedJob(job);
                                        // Initialize edit data
                                        const editData: any = {
                                          amount: actualCost || paymentAmount || '',
                                          paymentMethod: paymentMethod || 'CASH',
                                          qrCodeName: qrPhotos?.selected_qr_code_name || '',
                                          amcInfo: amcInfo || null,
                                          completionNotes: completionNotes || '',
                                          completedBy: completedBy || '',
                                        };
                                        setCompletedJobEditData(editData);
                                        setEditCompletedJobDialogOpen(true);
                                      }}
                                      className="text-xs flex-1 sm:flex-none"
                                    >
                                      <Edit className="w-3 h-3 mr-1" />
                                      Edit
                                    </Button>
                                    {(() => {
                                      const messageSent = requirements.some((r: any) => r?.message_sent === true);
                                      if (!messageSent) {
                                        return (
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => {
                                              setSelectedJobForMessage(job);
                                              setSendMessageDialogOpen(true);
                                            }}
                                            className="text-xs flex-1 sm:flex-none"
                                          >
                                            <WhatsAppIcon className="w-3 h-3 mr-1" />
                                            Send Message
                                          </Button>
                                        );
                                      }
                                      return (
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          disabled
                                          className="text-xs opacity-50 flex-1 sm:flex-none"
                                        >
                                          <WhatsAppIcon className="w-3 h-3 mr-1" />
                                          Message Sent
                                        </Button>
                                      );
                                    })()}
                                  </div>
                                </div>
                              </div>
                            )}
                            {job.status === 'DENIED' && (denialReason || deniedBy || deniedAt) && (
                              <div className="mt-4 mb-2">
                                <div className="flex items-start gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2">
                                  <XCircle className="w-4 h-4 text-red-600 mt-0.5" />
                                  <div className="space-y-1 text-sm text-gray-900">
                                    <div className="font-semibold text-red-900">
                                      Job Denied
                                    </div>
                                    {deniedBy && (
                                      <div className="text-gray-700">
                                        <span className="text-gray-500">Denied by:</span> {deniedBy}
                                      </div>
                                    )}
                                    {denialReason && (
                                      <div className="text-gray-700">
                                        <span className="text-gray-500">Reason:</span> {denialReason}
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
                            )}
                            {job.status === 'FOLLOW_UP' && (formattedFollowUpDate || formattedFollowUpTime || followUpNotes || formattedFollowUpScheduledAt) && (
                              <div className="mt-4 mb-2">
                                <div className="flex items-start gap-3 rounded-md border border-gray-200 px-3 py-2">
                                  <CalendarPlus className="w-4 h-4 text-gray-500 mt-0.5" />
                                  <div className="space-y-1 text-sm text-gray-900">
                                    <div className="font-semibold">
                                      Follow-up scheduled for {formattedFollowUpDate || 'Date not set'}
                                      {formattedFollowUpTime ? ` at ${formattedFollowUpTime}` : ''}
                                    </div>
                                    <div className="text-gray-700">
                                      <span className="text-gray-500">Reason:</span> {followUpNotes || 'Not confirmed'}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                      Scheduled by {followUpScheduledByName}
                                      {formattedFollowUpScheduledAt ? ` on ${formattedFollowUpScheduledAt}` : ''}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                            <div className="bg-white rounded-lg border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all duration-200 overflow-hidden group">
                            <div className="p-3 sm:p-4">
                              <div className="flex items-start justify-between mb-4">
                                <div className="flex-1 min-w-0">
                                  {/* Mobile: Stack badges vertically, Desktop: Horizontal */}
                                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-3">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <Badge className="bg-blue-100 text-blue-800 border-0">
                                        {job.service_type || job.serviceType} {job.service_sub_type || job.serviceSubType}
                                      </Badge>
                                      {getStatusBadge(job.status)}
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
                                    <div className="mt-4 pt-4 border-t border-gray-100">
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
                                      {(job.status === 'PENDING' || job.status === 'ASSIGNED' || job.status === 'IN_PROGRESS' || job.status === 'FOLLOW_UP' || job.status === 'RESCHEDULED') && (
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
                                      {(job.status === 'PENDING' || job.status === 'ASSIGNED' || job.status === 'IN_PROGRESS') && (
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
                                        <DropdownMenuItem onClick={() => handleScheduleFollowUp(job)}>
                                          <CalendarPlus className="mr-2 h-4 w-4" />
                                          Schedule Follow-up
                                        </DropdownMenuItem>
                                      )}
                                      <DropdownMenuItem 
                                        onClick={() => {
                                          toast.info('Job details feature coming soon');
                                        }}
                                      >
                                        <Eye className="mr-2 h-4 w-4" />
                                        View Details
                                      </DropdownMenuItem>
                                      <DropdownMenuItem 
                                        onClick={() => handleEditJob(job)}
                                      >
                                        <Edit className="mr-2 h-4 w-4" />
                                        Edit Job
                                      </DropdownMenuItem>
                                      {(job as any).assigned_technician_id && (
                                        <DropdownMenuItem 
                                          onClick={() => handleReassignJob(job)}
                                        >
                                          <User className="mr-2 h-4 w-4" />
                                          Reassign Technician
                                        </DropdownMenuItem>
                                      )}
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

      {/* Add Customer Dialog - Step by Step */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="w-[95vw] sm:w-[90vw] md:w-[80vw] lg:w-[60vw] xl:w-[50vw] max-w-2xl h-[90vh] max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2 sm:gap-3">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold text-xs sm:text-sm">
                  {currentStep}
                </div>
                <span className="text-sm sm:text-base">Add New Customer</span>
              </div>
              <div className="flex gap-1 ml-auto">
                {[1, 2, 3, 4, 5].map((step) => (
                  <div
                    key={step}
                    className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${
                      step <= currentStep ? 'bg-blue-600' : 'bg-gray-300'
                    }`}
                  />
                ))}
              </div>
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              {currentStep === 1 && "Enter customer's personal information"}
              {currentStep === 2 && "Enter customer's address details"}
              {currentStep === 3 && "Select services and equipment details"}
              {currentStep === 4 && "Review and confirm customer information"}
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-6 px-2 sm:px-4 flex-1 overflow-y-auto">
            {/* Step 1: Personal Information */}
            {currentStep === 1 && (
              <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="add_full_name" className="text-sm font-medium">Full Name</Label>
              <Input
                id="add_full_name"
                value={addFormData.full_name}
                onChange={(e) => handleAddFormChange('full_name', e.target.value)}
                placeholder="Enter full name"
                className={`text-sm ${formErrors.full_name ? 'border-red-500' : ''}`}
              />
                  {formErrors?.full_name && (
                    <p className="text-xs text-red-500">{formErrors.full_name}</p>
                  )}
            </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
                    <Label htmlFor="add_phone" className="text-sm font-medium">Primary Phone</Label>
              <Input
                id="add_phone"
                value={addFormData.phone}
                onChange={(e) => handlePhoneChange(e.target.value)}
                placeholder="Enter 10-digit phone number"
                className={`text-sm ${formErrors.phone ? 'border-red-500' : ''}`}
              />
                    {formErrors?.phone && (
                      <p className="text-xs text-red-500">{formErrors.phone}</p>
                    )}
            </div>

            <div className="space-y-2">
                    <Label htmlFor="add_alternate_phone" className="text-sm font-medium">Alternate Phone</Label>
              <Input
                      id="add_alternate_phone"
                      value={addFormData.alternate_phone}
                      onChange={(e) => handleAlternatePhoneChange(e.target.value)}
                      placeholder="Enter 10-digit phone number (optional)"
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
                onChange={(e) => handleAddFormChange('email', e.target.value)}
                placeholder="Enter email address"
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
                  <Label htmlFor="add_address">Complete Address</Label>
                  <Textarea
                    id="add_address"
                    value={addFormData.address}
                    onChange={(e) => handleAddFormChange('address', e.target.value)}
                    placeholder="Enter complete address (street, area, city, state, pincode)"
                    rows={3}
                    className={formErrors.address ? 'border-red-500' : ''}
                  />
                  {formErrors?.address && (
                    <p className="text-sm text-red-500">{formErrors.address}</p>
                  )}
            </div>

            <div className="space-y-2">
                  <Label htmlFor="add_google_location">Google Maps Location (Optional)</Label>
                  <div className="flex gap-2">
              <Input
                      id="add_google_location"
                      value={addFormData.google_location}
                      onChange={(e) => handleAddFormChange('google_location', e.target.value)}
                      placeholder="Enter Google Maps link or coordinates"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleGoogleMapsNavigation}
                      disabled={!addFormData.address.trim()}
                      className="flex items-center gap-2 whitespace-nowrap"
                    >
                      <MapPin className="w-4 h-4" />
                      Open in Maps
                    </Button>
            </div>
                  <p className="text-xs text-gray-500">
                    Enter the address above, then click "Open in Maps" to navigate to the location
                  </p>
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
                      { value: 'RO', label: 'RO (Reverse Osmosis)', icon: '💧' },
                      { value: 'SOFTENER', label: 'Water Softener', icon: '🧂' },
                      { value: 'AC', label: 'AC Services', icon: '❄️' },
                      { value: 'APPLIANCE', label: 'Home Appliances', icon: '🏠' }
                    ].map((service) => (
                      <div
                        key={service.value}
                        onClick={() => handleServiceTypeToggle(service.value)}
                        className={`p-3 border-2 rounded-lg cursor-pointer transition-all ${
                          addFormData.service_types.includes(service.value)
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{service.icon}</span>
                          <span className="text-sm font-medium">{service.label}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  {formErrors?.service_types && (
                    <p className="text-sm text-red-500">{formErrors.service_types}</p>
                  )}
                </div>

                {/* Dynamic Equipment Fields for Each Selected Service Type */}
                {addFormData.service_types.length > 0 && (
                  <div className="space-y-4">
                    <Label className="text-base font-semibold">Equipment Details</Label>
                    {addFormData.service_types.map((serviceType) => {
                      const serviceInfo = [
                        { value: 'RO', label: 'RO (Reverse Osmosis)', icon: '💧' },
                        { value: 'SOFTENER', label: 'Water Softener', icon: '🧂' },
                        { value: 'AC', label: 'AC Services', icon: '❄️' },
                        { value: 'APPLIANCE', label: 'Home Appliances', icon: '🏠' }
                      ].find(s => s.value === serviceType);
                      
                      const equipment = addFormData.equipment[serviceType] || { brand: '', model: '' };
                      
                      return (
                        <div key={serviceType} className="bg-gray-50 p-4 rounded-lg space-y-3">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{serviceInfo?.icon}</span>
                            <span className="font-medium text-gray-900">{serviceInfo?.label}</span>
                          </div>
                          
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
                              <Label htmlFor={`brand_${serviceType}`}>Brand</Label>
              <Input
                                id={`brand_${serviceType}`}
                                value={equipment.brand}
                                onChange={(e) => handleEquipmentChange(serviceType, 'brand', e.target.value)}
                                placeholder={`Enter ${serviceType} brand`}
                                className={formErrors[`equipment.${serviceType}.brand`] ? 'border-red-500' : ''}
                              />
                              {formErrors?.[`equipment.${serviceType}.brand`] && (
                                <p className="text-sm text-red-500">{formErrors[`equipment.${serviceType}.brand`]}</p>
                              )}
            </div>

            <div className="space-y-2">
                              <Label htmlFor={`model_${serviceType}`}>Model</Label>
              <Input
                                id={`model_${serviceType}`}
                                value={equipment.model}
                                onChange={(e) => handleEquipmentChange(serviceType, 'model', e.target.value)}
                                placeholder={`Enter ${serviceType} model`}
                                className={formErrors[`equipment.${serviceType}.model`] ? 'border-red-500' : ''}
                              />
                              {formErrors?.[`equipment.${serviceType}.model`] && (
                                <p className="text-sm text-red-500">{formErrors[`equipment.${serviceType}.model`]}</p>
                              )}
            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}


            {/* Step 4: Review & Notes */}
            {currentStep === 4 && (
              <div className="space-y-4">
                <div className="bg-gray-50 p-4 rounded-lg space-y-3">
                  <h3 className="font-semibold text-gray-900">Customer Information Summary</h3>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium text-gray-600">Name:</span>
                      <p className="text-gray-900">{addFormData.full_name || 'Not provided'}</p>
                    </div>
                    <div>
                      <span className="font-medium text-gray-600">Phone:</span>
                      <p className="text-gray-900">{addFormData.phone || 'Not provided'}</p>
                    </div>
                    {addFormData.alternate_phone && (
                      <div>
                        <span className="font-medium text-gray-600">Alternate Phone:</span>
                        <p className="text-gray-900">{addFormData.alternate_phone}</p>
                      </div>
                    )}
                    <div>
                      <span className="font-medium text-gray-600">Email:</span>
                      <p className="text-gray-900">{addFormData.email || 'Not provided'}</p>
                    </div>
                    <div className="sm:col-span-2">
                      <span className="font-medium text-gray-600">Address:</span>
                      <p className="text-gray-900">{addFormData.address || 'Not provided'}</p>
                      {addFormData.google_location && (
                        <div className="mt-1">
                          <span className="font-medium text-gray-600">Google Maps:</span>
                          <p className="text-blue-600 text-sm break-all">{addFormData.google_location}</p>
                        </div>
                      )}
                    </div>
                    <div className="sm:col-span-2">
                      <span className="font-medium text-gray-600">Services & Equipment:</span>
                      <div className="mt-1 space-y-2">
                        {addFormData.service_types.map((serviceType) => {
                          const serviceInfo = [
                            { value: 'RO', label: 'RO (Reverse Osmosis)', icon: '💧' },
                            { value: 'SOFTENER', label: 'Water Softener', icon: '🧂' },
                            { value: 'AC', label: 'AC Services', icon: '❄️' },
                            { value: 'APPLIANCE', label: 'Home Appliances', icon: '🏠' }
                          ].find(s => s.value === serviceType);
                          
                          const equipment = addFormData.equipment[serviceType];
                          
                          return (
                            <div key={serviceType} className="flex items-center gap-2 text-sm">
                              <span>{serviceInfo?.icon}</span>
                              <span className="font-medium">{serviceInfo?.label}:</span>
                              <span className="text-gray-700">
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
          </div>

          <DialogFooter className="flex-shrink-0 flex flex-col sm:flex-row gap-2 sm:gap-0 sm:justify-between pt-4 border-t">
            <div className="flex gap-2 order-2 sm:order-1">
              {currentStep > 1 && (
                <Button variant="outline" onClick={prevStep} className="flex-1 sm:flex-none text-sm">
                  Previous
                </Button>
              )}
              <Button 
                variant="outline" 
                onClick={() => setAddDialogOpen(false)}
                disabled={isCreating}
                className="flex-1 sm:flex-none text-sm"
              >
                Cancel
              </Button>
            </div>
            
            <div className="order-1 sm:order-2">
              {currentStep < 4 ? (
                <Button onClick={nextStep} className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto text-sm">
                  Next Step
                </Button>
              ) : (
                <Button 
                  onClick={handleCreateCustomer}
                  disabled={isCreating}
                  className="bg-green-600 hover:bg-green-700 w-full sm:w-auto text-sm"
                >
                  {isCreating ? (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Creating...
                    </div>
                  ) : (
                    'Create Customer'
                  )}
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Customer Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Customer</DialogTitle>
            <DialogDescription>
              Update customer information for {(editingCustomer as any)?.customer_id} - {(editingCustomer as any)?.full_name}
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4 space-y-6">
            {/* Personal Information */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">Personal Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit_full_name">Full Name</Label>
                  <Input
                    id="edit_full_name"
                    value={editFormData?.full_name ?? ''}
                    onChange={(e) => handleEditFormChange('full_name', e.target.value)}
                    placeholder="Enter full name"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit_phone">Primary Phone</Label>
                  <Input
                    id="edit_phone"
                    value={editFormData?.phone ?? ''}
                    onChange={(e) => handleEditFormChange('phone', e.target.value)}
                    placeholder="Enter primary phone number"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit_alternate_phone">Alternate Phone</Label>
                  <Input
                    id="edit_alternate_phone"
                    value={editFormData?.alternate_phone ?? ''}
                    onChange={(e) => handleEditFormChange('alternate_phone', e.target.value)}
                    placeholder="Enter alternate phone number (optional)"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit_email">Email</Label>
                  <Input
                    id="edit_email"
                    type="email"
                    value={editFormData?.email ?? ''}
                    onChange={(e) => handleEditFormChange('email', e.target.value)}
                    placeholder="Enter email address"
                  />
                </div>
              </div>
            </div>

            {/* Address Information */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">Address Information</h3>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="edit_visible_address">Location</Label>
                  <div className="relative">
                    <Input
                      id="edit_visible_address"
                      value={editFormData?.visible_address ?? ''}
                      onChange={(e) => {
                        locationManuallyEditedRef.current = true; // Mark as manually edited
                        handleEditFormChange('visible_address', e.target.value);
                        setVisibleAddressSuggestions(e.target.value.length > 0);
                      }}
                      onFocus={() => setVisibleAddressSuggestions((editFormData?.visible_address || '').length > 0)}
                      onBlur={() => {
                        setTimeout(() => setVisibleAddressSuggestions(false), 200);
                      }}
                      placeholder="e.g., Bansawadi, Koramangala, Whitefield, etc."
                      maxLength={20}
                      className="text-sm"
                    />
                    {visibleAddressSuggestions && filteredAddressSuggestions.length > 0 && (
                      <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-y-auto">
                        {filteredAddressSuggestions.map((suggestion, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              locationManuallyEditedRef.current = true; // Mark as manually edited
                              handleEditFormChange('visible_address', suggestion);
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
                  <p className="text-xs text-gray-500">Enter a one-word location identifier for quick recognition. Start typing to see suggestions.</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit_full_address">Complete Address</Label>
                  <Textarea
                    id="edit_full_address"
                    value={editFormData?.address?.street ?? ''}
                    onChange={(e) => handleAddressFieldChange('street', e.target.value)}
                    placeholder="Enter complete address (e.g., 123 MG Road, Koramangala, Bangalore, Karnataka, 560034)"
                    rows={3}
                    className="resize-none"
                  />
                </div>

              </div>

              {/* Google Maps Location Section */}
              <div className="space-y-2">
                <Label htmlFor="edit_google_location" className="text-sm font-medium text-gray-900">
                  Google Maps Location
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="edit_google_location"
                    value={editFormData?.google_location ?? ''}
                    onChange={(e) => handleGoogleMapsLinkChange(e.target.value)}
                    placeholder="Paste Google Maps share link here..."
                    className="text-sm flex-1"
                  />
                  {editFormData?.google_location && (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={fetchAddressFromGoogleLocation}
                        className="whitespace-nowrap"
                        title="Fetch address from Google Maps link"
                      >
                        <Download className="w-3 h-3 mr-1" />
                        Fetch Address
                      </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        window.open(editFormData.google_location, '_blank', 'noopener,noreferrer');
                      }}
                      className="whitespace-nowrap"
                        title="Open in Google Maps"
                    >
                      <ExternalLink className="w-3 h-3 mr-1" />
                      Test
                    </Button>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Service Information */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">Service Information</h3>
              
              <div className="space-y-3">
                <Label>Service Types</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { value: 'RO', label: 'RO (Reverse Osmosis)' },
                    { value: 'SOFTENER', label: 'Water Softener' }
                  ].map((service) => (
                    <div
                      key={service.value}
                      onClick={() => handleEditServiceTypeToggle(service.value)}
                      className={`p-3 border-2 rounded-lg cursor-pointer transition-all ${
                        editFormData?.service_types?.includes(service.value)
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{service.label}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Dynamic Equipment Fields for Each Selected Service Type */}
              {editFormData?.service_types?.length > 0 && (
                <div className="space-y-4">
                  <Label className="text-base font-semibold">Equipment Details</Label>
                  {editFormData?.service_types?.map((serviceType) => {
                    const serviceInfo = [
                      { value: 'RO', label: 'RO (Reverse Osmosis)' },
                      { value: 'SOFTENER', label: 'Water Softener' }
                    ].find(s => s.value === serviceType);
                    
                    const equipment = editFormData?.equipment?.[serviceType] || { brand: '', model: '' };
                    
                    return (
                      <div key={serviceType} className="bg-gray-50 p-4 rounded-lg space-y-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">{serviceInfo?.label}</span>
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-2 relative">
                            <Label htmlFor={`edit_brand_${serviceType}`}>Brand</Label>
                            <Input
                              id={`edit_brand_${serviceType}`}
                              value={equipment.brand}
                              onChange={(e) => handleEditEquipmentChange(serviceType, 'brand', e.target.value)}
                              placeholder={`Enter ${serviceType} brand`}
                              onBlur={() => {
                                setTimeout(() => setShowBrandSuggestions(false), 200);
                              }}
                            />
                            {showBrandSuggestions && brandSuggestions.length > 0 && (
                              <div className="absolute z-10 w-full mt-1 bg-card border border-border rounded-md shadow-lg max-h-40 overflow-y-auto">
                                {brandSuggestions.map((brand, index) => (
                                  <div
                                    key={index}
                                    className="px-3 py-2 hover:bg-accent hover:text-accent-foreground cursor-pointer text-sm text-foreground"
                                    onClick={() => selectEditBrand(serviceType, brand)}
                                  >
                                    {brand}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="space-y-2 relative">
                            <Label htmlFor={`edit_model_${serviceType}`}>Model</Label>
                            <Input
                              id={`edit_model_${serviceType}`}
                              value={equipment.model}
                              onChange={(e) => handleEditEquipmentChange(serviceType, 'model', e.target.value)}
                              placeholder={`Enter ${serviceType} model`}
                              onBlur={() => {
                                setTimeout(() => setShowModelSuggestions(false), 200);
                              }}
                            />
                            {showModelSuggestions && modelSuggestions.length > 0 && (
                              <div className="absolute z-10 w-full mt-1 bg-card border border-border rounded-md shadow-lg max-h-40 overflow-y-auto">
                                {modelSuggestions.map((model, index) => (
                                  <div
                                    key={index}
                                    className="px-3 py-2 hover:bg-accent hover:text-accent-foreground cursor-pointer text-sm text-foreground"
                                    onClick={() => selectEditModel(serviceType, model)}
                                  >
                                    {model}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Additional Information */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">Additional Information</h3>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Does the customer have a prefilter?</Label>
                  <div className="flex gap-4">
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        id="edit-prefilter-yes"
                        name="edit-prefilter"
                        checked={editFormData.has_prefilter === true}
                        onChange={() => handleEditFormChange('has_prefilter', true)}
                        className="w-4 h-4"
                      />
                      <Label htmlFor="edit-prefilter-yes" className="cursor-pointer">Yes</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        id="edit-prefilter-no"
                        name="edit-prefilter"
                        checked={editFormData.has_prefilter === false}
                        onChange={() => handleEditFormChange('has_prefilter', false)}
                        className="w-4 h-4"
                      />
                      <Label htmlFor="edit-prefilter-no" className="cursor-pointer">No</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        id="edit-prefilter-unknown"
                        name="edit-prefilter"
                        checked={editFormData.has_prefilter === null}
                        onChange={() => handleEditFormChange('has_prefilter', null)}
                        className="w-4 h-4"
                      />
                      <Label htmlFor="edit-prefilter-unknown" className="cursor-pointer">Not Set</Label>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setEditDialogOpen(false)}
              disabled={isUpdating}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleUpdateCustomer}
              disabled={isUpdating}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isUpdating ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Updating...
                </div>
              ) : (
                'Update Customer'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
      <Dialog open={photoGalleryOpen} onOpenChange={setPhotoGalleryOpen}>
        <DialogContent className="max-w-6xl max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Job Photos
            </DialogTitle>
            <DialogDescription>
              Click on any photo to view it in full size or use the delete button to remove photos
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            {selectedJobPhotos?.photos && Array.isArray(selectedJobPhotos.photos) && selectedJobPhotos.photos.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {selectedJobPhotos.photos.map((photo, index) => {
                  // Check if photo is a valid URL
                  const isValidUrl = photo && typeof photo === 'string' && (photo.startsWith('http') || photo.startsWith('data:') || photo.startsWith('/'));
                  
                  return (
                    <div key={`photo-${index}-${photo?.slice(-10) || 'unknown'}`} className="relative group">
                      {isValidUrl ? (
                        <img
                          src={photo}
                          alt={`Photo ${index + 1}`}
                          className="w-full h-48 object-cover rounded-lg border border-gray-200 cursor-pointer hover:opacity-90 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (photo && photo.trim()) {
                              openPhotoViewer(photo, index, selectedJobPhotos.photos.length);
                            } else {
                              toast.error('Invalid photo URL');
                            }
                          }}
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="w-full h-48 bg-gray-100 rounded-lg border border-gray-200 flex items-center justify-center">
                          <div className="text-center text-gray-500">
                            <Calendar className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                            <p className="text-sm">Invalid photo URL</p>
                            <p className="text-xs text-gray-400">{photo || 'No URL provided'}</p>
                          </div>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all duration-200 rounded-lg flex items-center justify-center">
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                          <Button 
                            variant="secondary" 
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (photo && photo.trim()) {
                                openPhotoViewer(photo, index, selectedJobPhotos.photos.length);
                              } else {
                                toast.error('Invalid photo URL');
                              }
                            }}
                          >
                            View Full Size
                          </Button>
                          <Button 
                            variant="destructive" 
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeletePhoto((selectedJobPhotos as any)?.jobId, index, photo);
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <Calendar className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                <p>No photos available</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Full-Screen Photo Viewer Modal */}
      <Dialog open={photoViewerOpen} onOpenChange={setPhotoViewerOpen}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 bg-black">
          <DialogHeader className="sr-only">
            <DialogTitle>Photo Viewer</DialogTitle>
            <DialogDescription>Full-screen photo viewer</DialogDescription>
          </DialogHeader>
          <div className="relative w-full h-full flex items-center justify-center">
            {/* Close button */}
            <Button
              variant="ghost"
              size="sm"
              className="absolute top-4 right-4 z-10 bg-black/50 text-white hover:bg-black/70"
              onClick={() => setPhotoViewerOpen(false)}
            >
              <span className="text-xl">×</span>
            </Button>

            {/* Previous button */}
            {selectedPhoto && selectedPhoto.total > 1 && (
              <Button
                variant="ghost"
                size="sm"
                className="absolute left-4 top-1/2 transform -translate-y-1/2 z-10 bg-black/50 text-white hover:bg-black/70"
                onClick={goToPreviousPhoto}
              >
                <span className="text-xl">‹</span>
              </Button>
            )}

            {/* Next button */}
            {selectedPhoto && selectedPhoto.total > 1 && (
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-4 top-1/2 transform -translate-y-1/2 z-10 bg-black/50 text-white hover:bg-black/70"
                onClick={goToNextPhoto}
              >
                <span className="text-xl">›</span>
              </Button>
            )}

            {/* Photo counter */}
            {selectedPhoto && selectedPhoto.total > 1 && (
              <div className="absolute top-4 left-4 z-10 bg-black/50 text-white px-3 py-1 rounded-full text-sm">
                {selectedPhoto.index + 1} / {selectedPhoto.total}
              </div>
            )}

            {/* Action buttons */}
            {selectedPhoto && (
              <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-10 flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => downloadPhoto(selectedPhoto.url, selectedPhoto.index)}
                  className="bg-white/90 text-black hover:bg-white"
                >
                  <Calendar className="w-4 h-4 mr-2" />
                  Download
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyPhotoLink(selectedPhoto.url)}
                  className="bg-white/90 text-black hover:bg-white border-gray-300"
                >
                  <Calendar className="w-4 h-4 mr-2" />
                  Copy Link
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    setPhotoViewerOpen(false);
                    handleDeletePhoto((selectedJobPhotos as any)?.jobId, selectedPhoto.index, selectedPhoto.url);
                  }}
                  className="bg-red-600/90 text-white hover:bg-red-700"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </Button>
              </div>
            )}

            {/* Main photo */}
            {selectedPhoto && (
              <img
                src={selectedPhoto.url}
                alt={`Photo ${selectedPhoto.index + 1}`}
                className="max-w-full max-h-full object-contain"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>


      {/* Job Assignment Dialog */}
      <Dialog open={assignJobDialogOpen} onOpenChange={setAssignJobDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Assign Job to Technician(s)</DialogTitle>
            <DialogDescription>
              Choose how to assign this job - directly to one technician or send requests to multiple technicians
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 overflow-y-auto flex-1 pr-2">
            <div>
              <Label htmlFor="job-info">Job Details</Label>
              <div className="mt-1 p-4 bg-gray-50 rounded-md">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-mono font-bold text-lg">{(jobToAssign as any)?.job_number}</span>
                  <Badge className="bg-blue-100 text-blue-800">
                    {(jobToAssign as any)?.service_type} - {(jobToAssign as any)?.service_sub_type}
                  </Badge>
                </div>
                <p className="text-sm text-gray-600">
                  <strong>Customer:</strong> {(jobToAssign as any)?.customer?.full_name || 'N/A'}
                </p>
                <p className="text-sm text-gray-600">
                  <strong>Scheduled:</strong> {(jobToAssign as any)?.scheduled_date} - {(jobToAssign as any)?.scheduled_time_slot}
                </p>
                <p className="text-sm text-gray-600">
                  <strong>Location:</strong> {(jobToAssign as any)?.service_address?.street || 'N/A'}
                </p>
                {(jobToAssign as any)?.service_location?.googleLocation && (
                  <div className="mt-2">
                    <a 
                      href={(jobToAssign as any)?.service_location?.googleLocation}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm font-medium"
                    >
                      <MapPin className="w-4 h-4" />
                      Open in Google Maps
                    </a>
                  </div>
                )}
              </div>
            </div>

            {/* Calculate Distance & Time Button */}
            <div className="flex items-center justify-center py-3 border-t border-b">
              <Button
                type="button"
                variant="default"
                onClick={async () => {
                  if (jobToAssign) {
                    await calculateDistancesForJob(jobToAssign);
                  }
                }}
                disabled={loadingDistances || !jobToAssign}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {loadingDistances ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Calculating...
                  </>
                ) : (
                  <>
                    <MapPin className="w-4 h-4 mr-2" />
                    Calculate Distance & Time
                  </>
                )}
              </Button>
            </div>

            {/* Assignment Type Selection */}
            <div className="space-y-4">
              <div>
                <Label className="text-base font-semibold">Assignment Method</Label>
                <div className="mt-2 space-y-3">
                  <div className="flex items-center space-x-3">
                    <input
                      type="radio"
                      id="direct-assignment"
                      name="assignment-type"
                      value="direct"
                      checked={assignmentType === 'direct'}
                      onChange={(e) => setAssignmentType(e.target.value as 'direct' | 'bulk')}
                      className="h-4 w-4 text-blue-600"
                    />
                    <label htmlFor="direct-assignment" className="text-sm font-medium text-gray-700">
                      Direct Assignment - Assign directly to one technician
                    </label>
                  </div>
                  <div className="flex items-center space-x-3">
                    <input
                      type="radio"
                      id="bulk-assignment"
                      name="assignment-type"
                      value="bulk"
                      checked={assignmentType === 'bulk'}
                      onChange={(e) => setAssignmentType(e.target.value as 'direct' | 'bulk')}
                      className="h-4 w-4 text-blue-600"
                    />
                    <label htmlFor="bulk-assignment" className="text-sm font-medium text-gray-700">
                      Bulk Assignment - Send requests to multiple technicians (first to accept gets the job)
                    </label>
                  </div>
                </div>
              </div>

              {/* Direct Assignment */}
              {assignmentType === 'direct' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                  <Label htmlFor="technician-select">Select Technician</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        await reloadTechnicians();
                        if (jobToAssign) {
                          await calculateDistancesForJob(jobToAssign);
                        }
                      }}
                      className="text-xs"
                    >
                      🔄 Refresh Locations
                    </Button>
                  </div>
                  {loadingDistances ? (
                    <div className="flex items-center justify-center p-4">
                      <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mr-2" />
                      <span className="text-sm text-gray-600">Calculating distances...</span>
                    </div>
                  ) : (
                  <Select value={selectedTechnicianId} onValueChange={setSelectedTechnicianId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a technician" />
                    </SelectTrigger>
                      <SelectContent className="max-h-[300px] overflow-y-auto">
                      {technicians.length === 0 ? (
                        <SelectItem value="no-technicians" disabled>
                          No technicians available
                        </SelectItem>
                      ) : (
                          // Sort technicians by travel time (duration) if available
                          // Time is more important than distance in cities like Bengaluru
                          (() => {
                            const sortedTechnicians = [...technicians].sort((a, b) => {
                              const distA = technicianDistances.find(d => d.technicianId === a.id);
                              const distB = technicianDistances.find(d => d.technicianId === b.id);
                              
                              if (!distA?.distance || distA.distance.status !== 'OK') return 1;
                              if (!distB?.distance || distB.distance.status !== 'OK') return -1;
                              
                              return distA.distance.duration.value - distB.distance.duration.value;
                            });

                            return sortedTechnicians.map((technician) => {
                              const distanceInfo = technicianDistances.find(d => d.technicianId === technician.id);
                              const hasDistance = distanceInfo?.distance && distanceInfo.distance.status === 'OK';
                              
                              // Determine why location is unavailable
                              // Show time prominently since it's more important than distance
                              let distanceText = '';
                              if (hasDistance) {
                                distanceText = `${distanceInfo.distance.duration.text} • ${distanceInfo.distance.distance.text}`;
                              } else {
                                const hasLocation = technician.currentLocation?.latitude && technician.currentLocation?.longitude;
                                if (!hasLocation) {
                                  distanceText = 'No location data - Technician needs to open dashboard';
                                } else if (distanceInfo?.distance?.status === 'ZERO_RESULTS') {
                                  distanceText = 'Route not found';
                                } else {
                                  distanceText = 'Location unavailable';
                                }
                              }
                              
                              const rank = distanceInfo?.rank;

                              return (
                          <SelectItem
                            key={technician.id}
                            value={technician.id || 'unknown'}
                          >
                                  <div className="flex items-center justify-between w-full">
                                    <div className="flex items-center gap-2">
                                      {rank && rank <= 3 && (
                                        <span className="text-xs font-bold text-blue-600">#{rank}</span>
                                      )}
                                      <span>{technician.fullName || 'Unknown Technician'}</span>
                                      <Badge 
                                        variant={technician.status === 'AVAILABLE' ? 'default' : technician.status === 'BUSY' ? 'secondary' : 'outline'}
                                        className="text-xs"
                                        title={
                                          technician.status === 'OFFLINE' 
                                            ? 'Technician is offline or hasn\'t opened their dashboard recently'
                                            : technician.status === 'BUSY'
                                            ? 'Technician is currently working on a job'
                                            : technician.status === 'ON_BREAK'
                                            ? 'Technician is on break'
                                            : 'Technician is available'
                                        }
                                      >
                                        {technician.status || 'OFFLINE'}
                                      </Badge>
                                    </div>
                                    <span className="text-xs text-gray-500 ml-2">{distanceText}</span>
                                  </div>
                          </SelectItem>
                              );
                            });
                          })()
                      )}
                    </SelectContent>
                  </Select>
                  )}
                  
                  {/* Show detailed technician list with distances */}
                  {technicianDistances.length > 0 && !loadingDistances && (
                    <div className="mt-3 p-3 bg-gray-50 rounded-md space-y-2 max-h-[300px] overflow-y-auto">
                      <Label className="text-sm font-semibold text-gray-700">Technicians ranked by travel time:</Label>
                      {technicians
                        .map(tech => {
                          const distanceInfo = technicianDistances.find(d => d.technicianId === tech.id);
                          return { tech, distanceInfo };
                        })
                        .sort((a, b) => {
                          if (!a.distanceInfo?.distance || a.distanceInfo.distance.status !== 'OK') return 1;
                          if (!b.distanceInfo?.distance || b.distanceInfo.distance.status !== 'OK') return -1;
                          return a.distanceInfo.distance.duration.value - b.distanceInfo.distance.duration.value;
                        })
                        .map(({ tech, distanceInfo }) => {
                          const hasDistance = distanceInfo?.distance && distanceInfo.distance.status === 'OK';
                          const hasLocation = tech.currentLocation?.latitude && tech.currentLocation?.longitude;
                          const isSelected = selectedTechnicianId === tech.id;
                          
                          return (
                            <div
                              key={tech.id}
                              onClick={() => setSelectedTechnicianId(tech.id)}
                              className={`p-2 rounded border cursor-pointer transition-colors ${
                                isSelected 
                                  ? 'border-blue-500 bg-blue-50' 
                                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-100'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  {distanceInfo?.rank && (
                                    <span className={`text-sm font-bold ${
                                      distanceInfo.rank === 1 ? 'text-green-600' :
                                      distanceInfo.rank === 2 ? 'text-blue-600' :
                                      distanceInfo.rank === 3 ? 'text-purple-600' :
                                      'text-gray-500'
                                    }`}>
                                      #{distanceInfo.rank}
                                    </span>
                                  )}
                                  <span className="font-medium">{tech.fullName || 'Unknown'}</span>
                                  <Badge 
                                    variant={tech.status === 'AVAILABLE' ? 'default' : tech.status === 'BUSY' ? 'secondary' : 'outline'}
                                    className="text-xs"
                                    title={
                                      tech.status === 'OFFLINE' 
                                        ? 'Technician is offline or hasn\'t opened their dashboard recently'
                                        : tech.status === 'BUSY'
                                        ? 'Technician is currently working on a job'
                                        : tech.status === 'ON_BREAK'
                                        ? 'Technician is on break'
                                        : 'Technician is available'
                                    }
                                  >
                                    {tech.status || 'OFFLINE'}
                                  </Badge>
                                  {tech.status === 'OFFLINE' && tech.currentLocation?.lastUpdated && (
                                    <span className="text-xs text-gray-400" title={`Last location update: ${new Date(tech.currentLocation.lastUpdated).toLocaleString()}`}>
                                      (No recent activity)
                                    </span>
                                  )}
                                </div>
                                <div className="text-right">
                                  {hasDistance ? (
                                    <div className="text-sm">
                                      <div className="font-semibold text-gray-900">
                                        {distanceInfo.distance.duration.text}
                                      </div>
                                      <div className="text-xs text-gray-500">
                                        {distanceInfo.distance.distance.text}
                                      </div>
                                    </div>
                                  ) : hasLocation ? (
                                    <div className="text-xs text-gray-400">Distance calculation failed</div>
                                  ) : (
                                    <div className="text-xs text-gray-400" title="Technician needs to open their dashboard to share location">
                                      No location data
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              )}

              {/* Bulk Assignment */}
              {assignmentType === 'bulk' && (
                <div>
                <div className="flex items-center justify-between mb-2">
                <Label htmlFor="technicians-select">Select Multiple Technicians</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      await reloadTechnicians();
                      if (jobToAssign) {
                        await calculateDistancesForJob(jobToAssign);
                      }
                    }}
                    className="text-xs"
                  >
                    🔄 Refresh Locations
                  </Button>
                </div>
                {loadingDistances ? (
                  <div className="flex items-center justify-center p-4">
                    <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mr-2" />
                    <span className="text-sm text-gray-600">Calculating distances...</span>
                  </div>
                ) : (
                  <div className="mt-2 space-y-2 max-h-[400px] overflow-y-auto border rounded-md p-3">
                  {technicians.length === 0 ? (
                    <p className="text-sm text-gray-500">No technicians available</p>
                  ) : (
                    technicians
                        .map(tech => {
                          const distanceInfo = technicianDistances.find(d => d.technicianId === tech.id);
                          return { tech, distanceInfo };
                        })
                        .sort((a, b) => {
                          if (!a.distanceInfo?.distance || a.distanceInfo.distance.status !== 'OK') return 1;
                          if (!b.distanceInfo?.distance || b.distanceInfo.distance.status !== 'OK') return -1;
                          return a.distanceInfo.distance.duration.value - b.distanceInfo.distance.duration.value;
                        })
                        .map(({ tech, distanceInfo }) => {
                          const technicianId = tech.id || '';
                        const isSelected = selectedTechnicianIds.includes(technicianId);
                          const hasDistance = distanceInfo?.distance && distanceInfo.distance.status === 'OK';
                          const hasLocation = tech.currentLocation?.latitude && tech.currentLocation?.longitude;

                        return (
                            <div 
                              key={tech.id} 
                              className={`flex items-center justify-between p-2 rounded border ${
                                isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                              }`}
                            >
                              <div className="flex items-center space-x-2 flex-1">
                            <input
                              type="checkbox"
                                  id={`tech-${tech.id}`}
                              value={technicianId}
                              checked={isSelected}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedTechnicianIds(prev => [...prev, technicianId]);
                                } else {
                                  setSelectedTechnicianIds(prev => prev.filter(id => id !== technicianId));
                                }
                              }}
                              className="h-4 w-4 text-blue-600 rounded"
                            />
                                <div className="flex items-center gap-2 flex-1">
                                  {distanceInfo?.rank && (
                                    <span className={`text-xs font-bold ${
                                      distanceInfo.rank === 1 ? 'text-green-600' :
                                      distanceInfo.rank === 2 ? 'text-blue-600' :
                                      distanceInfo.rank === 3 ? 'text-purple-600' :
                                      'text-gray-500'
                                    }`}>
                                      #{distanceInfo.rank}
                                    </span>
                                  )}
                            <label
                                    htmlFor={`tech-${tech.id}`}
                                    className="text-sm text-gray-700 font-medium cursor-pointer flex-1"
                            >
                                    {tech.fullName || 'Unknown Technician'}
                            </label>
                                  <Badge 
                                    variant={tech.status === 'AVAILABLE' ? 'default' : tech.status === 'BUSY' ? 'secondary' : 'outline'}
                                    className="text-xs"
                                    title={
                                      tech.status === 'OFFLINE' 
                                        ? 'Technician is offline or hasn\'t opened their dashboard recently'
                                        : tech.status === 'BUSY'
                                        ? 'Technician is currently working on a job'
                                        : tech.status === 'ON_BREAK'
                                        ? 'Technician is on break'
                                        : 'Technician is available'
                                    }
                                  >
                                    {tech.status || 'OFFLINE'}
                                  </Badge>
                                  {tech.status === 'OFFLINE' && tech.currentLocation?.lastUpdated && (
                                    <span className="text-xs text-gray-400 ml-1" title={`Last location update: ${new Date(tech.currentLocation.lastUpdated).toLocaleString()}`}>
                                      (No recent activity)
                                    </span>
                                  )}
                                </div>
                              </div>
                              {hasDistance && (
                                <div className="text-right text-xs">
                                  <div className="font-semibold text-gray-900">
                                    {distanceInfo.distance.duration.text}
                                  </div>
                                  <div className="text-gray-500">
                                    {distanceInfo.distance.distance.text}
                                  </div>
                                </div>
                              )}
                              {!hasDistance && hasLocation && (
                                <div className="text-xs text-gray-400">Distance calc failed</div>
                              )}
                              {!hasDistance && !hasLocation && (
                                <div className="text-xs text-gray-400" title="Technician needs to open their dashboard to share location">
                                  No location data
                                </div>
                              )}
                          </div>
                        );
                      })
                  )}
                </div>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  Selected: {selectedTechnicianIds.length} technician{selectedTechnicianIds.length !== 1 ? 's' : ''}
                </p>
                </div>
              )}
            </div>
          </div>
          
          <DialogFooter className="mt-4 flex-shrink-0">
            <Button
              variant="outline"
              onClick={() => {
                setAssignJobDialogOpen(false);
                setJobToAssign(null);
                setSelectedTechnicianId('');
                setSelectedTechnicianIds([]);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (assignmentType === 'bulk') {
                  handleSaveBulkJobAssignment();
                } else {
                  handleSaveJobAssignment();
                }
              }}
              disabled={
                isCreatingAssignmentRequests || 
                (assignmentType === 'direct' && !selectedTechnicianId) ||
                (assignmentType === 'bulk' && selectedTechnicianIds.length === 0)
              }
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isCreatingAssignmentRequests ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Sending Requests...
                </>
              ) : (
                <>
                  {assignmentType === 'bulk' ? 'Send Assignment Requests' : 'Assign Job'}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Job Dialog */}
      <Dialog open={newJobDialogOpen} onOpenChange={handleCloseNewJobDialog}>
        <DialogContent className="w-[95vw] sm:w-[90vw] md:w-[80vw] lg:w-[60vw] xl:w-[50vw] max-w-2xl h-[90vh] max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Create New Job</DialogTitle>
            <DialogDescription>
              Create a new service job for {(selectedCustomerForJob as any)?.customer_id} - {(selectedCustomerForJob as any)?.full_name}
            </DialogDescription>
          </DialogHeader>
          
          {selectedCustomerForJob && isJobDialogReady && (
            <div className="py-4 px-2 sm:px-4 space-y-6 flex-1 overflow-y-auto">
            {/* Service Information */}
            <div className="space-y-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
              <h3 className="text-lg font-semibold text-gray-900">Service Information</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="job_service_type">Service Type</Label>
                  <select
                    id="job_service_type"
                    value={newJobFormData.service_type || 'RO'}
                    onChange={(e) => handleNewJobFormChange('service_type', e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 appearance-none bg-white"
                    style={{
                      backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3e%3c/svg%3e")`,
                      backgroundPosition: 'right 0.5rem center',
                      backgroundRepeat: 'no-repeat',
                      backgroundSize: '1.5em 1.5em',
                      paddingRight: '2.5rem'
                    }}
                  >
                    <option value="RO">RO Water Purifier</option>
                    <option value="SOFTENER">Water Softener</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="job_service_sub_type">Service Sub Type</Label>
                  <select
                    id="job_service_sub_type"
                    value={newJobFormData.service_sub_type || 'Installation'}
                    onChange={(e) => handleNewJobFormChange('service_sub_type', e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 appearance-none bg-white"
                  >
                    <option value="Installation">Installation</option>
                    <option value="Repair">Repair</option>
                    <option value="Maintenance">Maintenance</option>
                    <option value="Replacement">Replacement</option>
                    <option value="Inspection">Inspection</option>
                    <option value="Other">Other</option>
                  </select>
                  {newJobFormData.service_sub_type === 'Other' && (
                    <Input
                      id="job_service_sub_type_custom"
                      value={newJobFormData.service_sub_type_custom}
                      onChange={(e) => handleNewJobFormChange('service_sub_type_custom', e.target.value)}
                      placeholder="Enter custom service sub type"
                      className="mt-2"
                    />
                  )}
                </div>

              </div>
            </div>

            {/* Scheduling */}
            <div className="space-y-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
              <h3 className="text-lg font-semibold text-gray-900">Scheduling</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="job_scheduled_date">Scheduled Date</Label>
                  <Input
                    id="job_scheduled_date"
                    type="date"
                    value={newJobFormData.scheduled_date}
                    onChange={(e) => handleNewJobFormChange('scheduled_date', e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="job_scheduled_time_slot">Time Slot</Label>
                  <select
                    id="job_scheduled_time_slot"
                    value={newJobFormData.scheduled_time_slot || 'MORNING'}
                    onChange={(e) => handleNewJobFormChange('scheduled_time_slot', e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 appearance-none bg-white"
                  >
                    <option value="MORNING">Morning (9 AM - 1 PM)</option>
                    <option value="AFTERNOON">Afternoon (1 PM - 6 PM)</option>
                    <option value="EVENING">Evening (6 PM - 9 PM)</option>
                    <option value="FLEXIBLE">Flexible</option>
                    <option value="CUSTOM">Custom Time</option>
                  </select>
                  {newJobFormData.scheduled_time_slot === 'CUSTOM' && (
                    <Input
                      id="job_scheduled_time_custom"
                      type="time"
                      value={newJobFormData.scheduled_time_custom}
                      onChange={(e) => handleNewJobFormChange('scheduled_time_custom', e.target.value)}
                      className="mt-2"
                    />
                  )}
                </div>


              </div>
            </div>

            {/* Photo Upload */}
            <div className="space-y-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
              <h3 className="text-lg font-semibold text-gray-900">Photos</h3>
              <div className="space-y-4">
                {/* Photo Upload Area */}
                <div 
                  className={`border-2 border-dashed rounded-lg p-6 text-center transition-all duration-200 cursor-pointer ${
                    isDragOverNewJob 
                      ? 'border-blue-500 bg-blue-50 scale-105' 
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDragOverNewJob(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDragOverNewJob(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDragOverNewJob(false);
                    const files = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith('image/'));
                    if (files.length > 0) {
                      handleNewJobPhotoUpload(files);
                    } else {
                      toast.error('Please drop image files only');
                    }
                  }}
                  onClick={() => document.getElementById('photo-upload')?.click()}
                >
                  <div className="flex flex-col items-center space-y-2">
                    {isDragOverNewJob ? (
                      <Upload className="w-8 h-8 text-blue-500" />
                    ) : (
                      <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                    )}
                    <p className="text-sm text-gray-600">
                      {isDragOverNewJob ? (
                        <span className="font-medium text-blue-600">Drop photos here</span>
                      ) : (
                        <>
                          <span className="font-medium text-blue-600">Click to upload</span> or drag and drop
                        </>
                      )}
                    </p>
                    <p className="text-xs text-gray-500">PNG, JPG, WEBP up to 10MB each</p>
                  </div>
                </div>
                
                {/* Hidden file input */}
                <input
                  id="photo-upload"
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={(e) => {
                    if (e.target.files) {
                      const files = Array.from(e.target.files);
                      handleNewJobPhotoUpload(files);
                    }
                  }}
                  className="hidden"
                />
                
                {/* Camera button for mobile */}
                <div className="flex justify-center">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => document.getElementById('camera-upload')?.click()}
                    className="flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Take Photo
                  </Button>
                </div>
                
                {/* Hidden camera input */}
                <input
                  id="camera-upload"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => {
                    if (e.target.files) {
                      const files = Array.from(e.target.files);
                      handleNewJobPhotoUpload(files);
                    }
                  }}
                  className="hidden"
                />
                
                {/* Photo Preview Grid */}
                {newJobFormData.photos.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {newJobFormData.photos.map((photo, index) => (
                      <div key={index} className="relative group">
                        <img
                          src={photo}
                          alt={`Upload ${index + 1}`}
                          className="w-full h-24 object-cover rounded-lg border"
                        />
                        {/* Show loading indicator for thumbnails (data URLs) */}
                        {photo.startsWith('data:') && (
                          <div className="absolute inset-0 bg-black bg-opacity-50 rounded-lg flex items-center justify-center">
                            <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemovePhoto(index)}
                          className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Job Details */}
            <div className="space-y-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
              <h3 className="text-lg font-semibold text-gray-900">Job Details</h3>
              <div className="space-y-2">
                <Label htmlFor="job_description">Description (Optional)</Label>
                <Textarea
                  id="job_description"
                  value={newJobFormData.description}
                  onChange={(e) => handleNewJobFormChange('description', e.target.value)}
                  placeholder="Describe the service requirements (optional)..."
                  rows={4}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="job_cost_agreed">Cost Already Agreed (₹)</Label>
                <Input
                  id="job_cost_agreed"
                  type="text"
                  value={newJobFormData.cost_agreed}
                  onChange={(e) => {
                    const value = e.target.value;
                    // Allow numbers, dashes, and spaces for ranges like "400-500"
                    if (value === '' || /^[\d\s-]+$/.test(value)) {
                      handleNewJobFormChange('cost_agreed', value);
                    }
                  }}
                  placeholder="e.g., 400 or 400-500"
                />
                <p className="text-xs text-gray-500">Enter a single amount or a range (e.g., 400-500)</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="job_lead_source">Lead Source *</Label>
                <select
                  id="job_lead_source"
                  value={newJobFormData.lead_source}
                  onChange={(e) => handleNewJobFormChange('lead_source', e.target.value)}
                  required
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 appearance-none bg-white"
                >
                  <option value="Website">Website</option>
                  <option value="Direct call">Direct call</option>
                  <option value="RO care india">RO care india</option>
                  <option value="Home triangle">Home triangle</option>
                  <option value="Other">Other</option>
                </select>
                {newJobFormData.lead_source === 'Other' && (
                  <Input
                    id="job_lead_source_custom"
                    value={newJobFormData.lead_source_custom || ''}
                    onChange={(e) => handleNewJobFormChange('lead_source_custom', e.target.value)}
                    placeholder="Enter lead source"
                    className="mt-2"
                  />
                )}
              </div>
            </div>
          </div>
          )}
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleCloseNewJobDialog}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateJob}
              disabled={isCreatingJob}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isCreatingJob ? 'Creating...' : 'Create Job'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Customer Photo Gallery Dialog */}
      <Dialog open={customerPhotoGalleryOpen} onOpenChange={handleClosePhotoGallery}>
        <DialogContent className="max-w-7xl max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Photo Gallery</span>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">
                  {(selectedCustomerForPhotos as any)?.customer_id} - {(selectedCustomerForPhotos as any)?.full_name}
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.multiple = true;
                      input.accept = 'image/*';
                      input.onchange = (e) => {
                        const files = (e.target as HTMLInputElement).files;
                        if (files) handlePhotoUpload(files);
                      };
                      input.click();
                    }}>
                      <Upload className="w-4 h-4 mr-2" />
                      Add Photos
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => {
                      // Download all photos as zip (placeholder)
                      toast.info('Download all photos feature coming soon');
                    }}>
                      <Download className="w-4 h-4 mr-2" />
                      Download All
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </DialogTitle>
            <DialogDescription>
              View and manage photos for this customer
            </DialogDescription>
          </DialogHeader>
          
          {selectedCustomerForPhotos && (
            <div className="space-y-6">
              {/* Upload Area - Only show if no photos and no uploading thumbnails */}
              {(() => {
                const customerId = selectedCustomerForPhotos?.customer_id || selectedCustomerForPhotos?.customerId;
                const photos = customerPhotos[customerId || ''];
                const uploadingCount = Object.keys(uploadingThumbnails).length;
                return (!photos || photos.length === 0) && uploadingCount === 0;
              })() && (
                <div
                  className={`border-2 border-dashed rounded-lg p-12 text-center transition-all duration-200 ${
                    isDragOverPhotos 
                      ? 'border-blue-500 bg-blue-100 scale-105' 
                      : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50'
                  } ${isUploadingPhoto ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={(e) => {
                    // Don't trigger file input if clicking on buttons
                    if ((e.target as HTMLElement).closest('button')) return;
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.multiple = true;
                    input.accept = 'image/*';
                    input.onchange = (e) => {
                      const files = (e.target as HTMLInputElement).files;
                      if (files) handlePhotoUpload(files);
                    };
                    input.click();
                  }}
                >
                  <div className="space-y-6">
                    <div className="relative">
                      <Camera className={`w-16 h-16 mx-auto ${isDragOverPhotos ? 'text-blue-500' : 'text-gray-400'}`} />
                      {isCompressingImage && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="flex items-center gap-1">
                            <div className="w-3 h-3 bg-black rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                            <div className="w-3 h-3 bg-black rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                            <div className="w-3 h-3 bg-black rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="space-y-3">
                      <div className="text-xl font-medium text-gray-600">
                        {isUploadingPhoto ? 'Uploading photos...' : isDragOverPhotos ? 'Drop photos here' : 'No photos found'}
                      </div>
                      <div className="text-sm text-gray-500">
                        Drag & drop photos here, click to browse, or use camera capture
                      </div>
                      <div className="flex flex-col sm:flex-row gap-3 justify-center items-center pt-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            const input = document.createElement('input');
                            input.type = 'file';
                            input.multiple = true;
                            input.accept = 'image/*';
                            input.onchange = (e) => {
                              const files = (e.target as HTMLInputElement).files;
                              if (files) handlePhotoUpload(files);
                            };
                            input.click();
                          }}
                          disabled={isUploadingPhoto}
                          className="flex items-center gap-2"
                        >
                          <Upload className="w-4 h-4" />
                          Browse Files
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCameraCapture();
                          }}
                          disabled={isUploadingPhoto}
                          className="flex items-center gap-2"
                        >
                          <Camera className="w-4 h-4" />
                          Capture Photo
                        </Button>
                      </div>
                      <div className="text-xs text-gray-400 pt-2">
                        Supports JPG, PNG, GIF up to 10MB • All photos stored in Cloudinary
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Loading State */}
              {isLoadingPhotos && (
                <div className="flex items-center justify-center py-12">
                  <div className="flex flex-col items-center gap-3">
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 bg-black rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                      <div className="w-3 h-3 bg-black rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                      <div className="w-3 h-3 bg-black rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                    </div>
                    <p className="text-sm text-gray-600">Loading photos...</p>
                  </div>
                </div>
              )}

              {/* Photo Grid */}
              {(() => {
                const customerId = selectedCustomerForPhotos?.customer_id || selectedCustomerForPhotos?.customerId;
                const photos = customerPhotos[customerId || ''];
                const uploadingCount = Object.keys(uploadingThumbnails).length;
                // Photo display check - show if we have photos OR uploading thumbnails
                return !isLoadingPhotos && customerId && ((photos && photos.length > 0) || uploadingCount > 0);
              })() && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <h3 className="text-lg font-medium">
                      {(() => {
                        const customerId = selectedCustomerForPhotos?.customer_id || selectedCustomerForPhotos?.customerId;
                        const photoCount = customerPhotos[customerId || '']?.length || 0;
                        const uploadingCount = Object.keys(uploadingThumbnails).length;
                        const total = photoCount + uploadingCount;
                        return `${total} Photo${total !== 1 ? 's' : ''}${uploadingCount > 0 ? ` (${uploadingCount} uploading...)` : ''}`;
                      })()}
                    </h3>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const input = document.createElement('input');
                          input.type = 'file';
                          input.multiple = true;
                          input.accept = 'image/*';
                          input.onchange = (e) => {
                            const files = (e.target as HTMLInputElement).files;
                            if (files) handlePhotoUpload(files);
                          };
                          input.click();
                        }}
                        disabled={isUploadingPhoto}
                        className="flex items-center gap-2"
                      >
                        <Upload className="w-4 h-4" />
                        Add Files
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCameraCapture}
                        disabled={isUploadingPhoto}
                        className="flex items-center gap-2"
                      >
                        <Camera className="w-4 h-4" />
                        Capture
                      </Button>
                    </div>
                  </div>
                  
                  <div 
                    className={`grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 p-4 rounded-lg border-2 border-dashed transition-all ${
                      isDragOverPhotos 
                        ? 'border-blue-500 bg-blue-50' 
                        : 'border-transparent'
                    }`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                  >
                    {/* Show uploading thumbnails first */}
                    {Object.entries(uploadingThumbnails).map(([thumbnailId, thumbnail]) => (
                      <div key={thumbnailId} className="relative group">
                        <div className="w-full h-40 bg-gray-100 rounded-lg border-2 border-dashed border-blue-400 overflow-hidden relative">
                          <img
                            src={thumbnail.url}
                            alt="Uploading..."
                            className="w-full h-full object-cover opacity-60"
                          />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                            <div className="flex flex-col items-center gap-2">
                              <div className="flex items-center gap-1">
                                <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                                <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                                <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                              </div>
                              <span className="text-xs text-white font-medium">Uploading...</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                    
                    {/* Show uploaded photos */}
                    {customerPhotos[selectedCustomerForPhotos?.customer_id || selectedCustomerForPhotos?.customerId || '']?.map((photo, index) => (
                      <div key={`${selectedCustomerForPhotos.id}-${index}`} className="relative group">
                        <div className="w-full h-40 bg-gray-100 rounded-lg border border-gray-200 overflow-hidden cursor-pointer">
                          <img
                            src={photo}
                            alt={`Photo ${index + 1}`}
                            className="w-full h-full object-cover transition-transform group-hover:scale-105"
                            onLoad={(e) => {
                              e.currentTarget.style.display = 'block';
                            }}
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              const placeholder = e.currentTarget.nextElementSibling as HTMLElement;
                              if (placeholder) placeholder.style.display = 'flex';
                            }}
                            onClick={() => {
                              const customerId = selectedCustomerForPhotos?.customer_id || selectedCustomerForPhotos?.customerId || '';
                              setSelectedPhoto({
                                url: photo,
                                index: index,
                                total: customerPhotos[customerId]?.length || 0
                              });
                            }}
                          />
                          <div 
                            className="w-full h-full flex items-center justify-center text-gray-400"
                            style={{ display: 'none' }}
                          >
                            <div className="text-center">
                              <Image className="w-8 h-8 mx-auto mb-2" />
                              <div className="text-xs">Failed to load</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Photo Viewer Dialog */}
      <Dialog open={!!selectedPhoto} onOpenChange={() => setSelectedPhoto(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-0">
          <DialogHeader className="sr-only">
            <DialogTitle>Photo Viewer</DialogTitle>
            <DialogDescription>View photo in full screen</DialogDescription>
          </DialogHeader>
          {selectedPhoto && (
            <div className="relative">
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
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setSelectedPhoto(null)}
                >
                  Close
                </Button>
              </div>
              <div className="absolute bottom-4 left-4 bg-black bg-opacity-50 text-white px-3 py-1 rounded">
                {selectedPhoto.index + 1} of {selectedPhoto.total}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Service History Dialog */}
      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Service History</DialogTitle>
            <DialogDescription>
              Complete service history for {(selectedCustomerForHistory as any)?.customer_id} - {(selectedCustomerForHistory as any)?.full_name}
            </DialogDescription>
          </DialogHeader>
          
          {selectedCustomerForHistory && (() => {
            const customerId = selectedCustomerForHistory.customer_id || selectedCustomerForHistory.customerId;
            const history = customerHistory[customerId] || [];
            
            return (
              <div className="space-y-4">
                {history.length > 0 ? (
                  <div className="space-y-4">
                    {history.map((job, index) => {
                    const lastServiceDate = job.completedAt || job.scheduledDate || job.createdAt;
                    const serviceDate = lastServiceDate ? new Date(lastServiceDate) : null;
                    
                    return (
                      <Card key={job.id} className="p-4 border-l-4 border-l-blue-500">
                        <div className="space-y-4">
                          {/* Header with Job Number and Status */}
                          <div className="flex items-start justify-between flex-wrap gap-3">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline" className="font-mono text-xs font-semibold">
                                {job.jobNumber || job.job_number || `Job #${index + 1}`}
                              </Badge>
                              <Badge 
                                variant={
                                  job.status === 'COMPLETED' ? 'default' :
                                  job.status === 'IN_PROGRESS' ? 'secondary' :
                                  job.status === 'CANCELLED' ? 'destructive' : 
                                  job.status === 'ASSIGNED' ? 'outline' : 'outline'
                                }
                                className="text-xs"
                              >
                                {job.status?.replace('_', ' ') || 'PENDING'}
                              </Badge>
                              {job.priority && (
                                <Badge variant="outline" className="text-xs">
                                  {job.priority}
                                </Badge>
                              )}
                            </div>
                            {serviceDate && (
                              <div className="text-right">
                                <div className="text-sm font-semibold text-gray-900">
                                  {job.completedAt ? 'Completed' : job.status === 'IN_PROGRESS' ? 'In Progress' : 'Scheduled'}
                                </div>
                                <div className="text-xs text-gray-500">
                                  {serviceDate.toLocaleDateString('en-IN', { 
                                    day: 'numeric', 
                                    month: 'short', 
                                    year: 'numeric' 
                                  })}
                                </div>
                                {job.completedAt && (
                                  <div className="text-xs text-gray-500">
                                    {new Date(job.completedAt).toLocaleTimeString('en-IN', { 
                                      hour: '2-digit', 
                                      minute: '2-digit' 
                                    })}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Service Details */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <Wrench className="w-4 h-4 text-gray-500" />
                                <div>
                                  <div className="text-sm font-semibold text-gray-900">
                                    {job.serviceType || job.service_type || 'N/A'} - {job.serviceSubType || job.service_sub_type || 'N/A'}
                                  </div>
                                  {(job.brand && job.model && 
                                    !job.brand.toLowerCase().includes('not specified') && 
                                    !job.brand.toLowerCase().includes('n/a') &&
                                    !job.model.toLowerCase().includes('not specified') && 
                                    !job.model.toLowerCase().includes('n/a')) && (
                                    <div className="text-xs text-gray-600">
                                      {job.brand} {job.model}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Technician Information */}
                            <div className="space-y-2">
                              {job.assignedTechnician ? (
                                <div className="flex items-center gap-2">
                                  <User className="w-4 h-4 text-gray-500" />
                                  <div>
                                    <div className="text-sm font-semibold text-gray-900">
                                      {job.assignedTechnician.fullName}
                                    </div>
                                    {job.assignedTechnician.phone && (
                                      <div className="text-xs text-gray-600">
                                        {job.assignedTechnician.phone}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 text-sm text-gray-500">
                                  <User className="w-4 h-4" />
                                  <span>No technician assigned</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Schedule Information */}
                          {job.scheduledDate && (
                            <div className="flex items-center gap-2 text-sm text-gray-600">
                              <Calendar className="w-4 h-4" />
                              <span>
                                Scheduled: {new Date(job.scheduledDate).toLocaleDateString('en-IN', { 
                                  day: 'numeric', 
                                  month: 'short', 
                                  year: 'numeric' 
                                })}
                                {job.scheduledTimeSlot && (
                                  <span className="ml-1">
                                    ({job.scheduledTimeSlot.replace('_', ' ')})
                                  </span>
                                )}
                              </span>
                            </div>
                          )}

                          {/* Description */}
                          {job.description && (
                            <div className="text-sm text-gray-700 bg-gray-50 p-3 rounded-md">
                              <div className="font-medium mb-1">Description:</div>
                              <div className="break-words">{job.description}</div>
                            </div>
                          )}

                          {/* Financial Information */}
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t">
                            {job.estimated_cost !== undefined && job.estimated_cost > 0 && (
                              <div>
                                <div className="text-xs text-gray-500">Estimated Cost</div>
                                <div className="text-sm font-semibold">₹{job.estimated_cost}</div>
                              </div>
                            )}
                            {job.actual_cost !== undefined && job.actual_cost > 0 && (
                              <div>
                                <div className="text-xs text-gray-500">Actual Cost</div>
                                <div className="text-sm font-semibold">₹{job.actual_cost}</div>
                              </div>
                            )}
                            {job.payment_status && (
                              <div>
                                <div className="text-xs text-gray-500">Payment Status</div>
                                <Badge 
                                  variant={job.payment_status === 'PAID' ? 'default' : 'outline'}
                                  className="text-xs mt-1"
                                >
                                  {job.payment_status}
                                </Badge>
                              </div>
                            )}
                            {job.estimatedDuration && (
                              <div>
                                <div className="text-xs text-gray-500">Duration</div>
                                <div className="text-sm font-semibold">{job.estimatedDuration} min</div>
                              </div>
                            )}
                          </div>

                          {/* Completion Notes */}
                          {job.completionNotes && (
                            <div className="text-sm text-gray-700 bg-green-50 p-3 rounded-md border border-green-200">
                              <div className="font-medium mb-1 text-green-800">Completion Notes:</div>
                              <div className="break-words text-green-900">{job.completionNotes}</div>
                            </div>
                          )}
                        </div>
                      </Card>
                    );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <History className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                    <div className="text-lg font-medium">No service history yet</div>
                    <div className="text-sm">Create a new job to start building service history</div>
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Phone Numbers Popup */}
      <Dialog open={phonePopupOpen} onOpenChange={setPhonePopupOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Phone className="w-5 h-5 text-blue-600" />
              Contact Numbers
            </DialogTitle>
            <DialogDescription>
              Choose a phone number to call for {(selectedCustomerPhone as any)?.full_name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Primary Phone */}
            <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div>
                <div className="font-semibold text-gray-900">{selectedCustomerPhone?.phone}</div>
                <div className="text-sm text-blue-600 font-medium">Primary Number</div>
              </div>
              <a 
                href={`tel:${selectedCustomerPhone?.phone}`}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
              >
                Call
              </a>
            </div>
            
            {/* Secondary Phone */}
            {(selectedCustomerPhone as any)?.alternate_phone && (
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div>
                  <div className="font-semibold text-gray-900">{(selectedCustomerPhone as any).alternate_phone}</div>
                  <div className="text-sm text-gray-600 font-medium">Secondary Number</div>
                </div>
                <a 
                  href={`tel:${(selectedCustomerPhone as any).alternate_phone}`}
                  className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                >
                  Call
                </a>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setPhonePopupOpen(false)}
              className="w-full"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reassign Job Dialog */}
      <Dialog open={reassignDialogOpen} onOpenChange={setReassignDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reassign Job</DialogTitle>
            <DialogDescription>
              Select a new technician for this job
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="technician-select">Select Technician</Label>
              <Select 
                value={selectedTechnicianForReassign} 
                onValueChange={setSelectedTechnicianForReassign}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a technician" />
                </SelectTrigger>
                <SelectContent>
                  {technicians.length === 0 ? (
                    <SelectItem value="no-technicians" disabled>
                      Loading technicians...
                    </SelectItem>
                  ) : (
                    technicians
                      .filter(tech => !tech.account_status || tech.account_status === 'ACTIVE')
                    .map(tech => (
                      <SelectItem key={tech.id || 'unknown'} value={tech.id || 'unknown'}>
                          {tech.fullName || 'Unknown'} {tech.employeeId ? `(${tech.employeeId})` : ''}
                      </SelectItem>
                      ))
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setReassignDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleReassignSubmit} disabled={!selectedTechnicianForReassign}>
              Reassign Job
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Job Dialog */}
      <Dialog open={editJobDialogOpen} onOpenChange={setEditJobDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Job</DialogTitle>
            <DialogDescription>
              Update job details and information
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit-service-type">Service Type</Label>
                <Select 
                  value={editJobFormData.serviceType} 
                  onValueChange={(value) => setEditJobFormData(prev => ({ ...prev, serviceType: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select service type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="RO">RO</SelectItem>
                    <SelectItem value="SOFTENER">Softener</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="edit-service-subtype">Service Sub Type</Label>
                <Select 
                  value={editJobFormData.serviceSubType} 
                  onValueChange={(value) => setEditJobFormData(prev => ({ ...prev, serviceSubType: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select service sub type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Installation">Installation</SelectItem>
                    <SelectItem value="Reinstallation">Reinstallation</SelectItem>
                    <SelectItem value="Service">Service</SelectItem>
                    <SelectItem value="Repair">Repair</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                    <SelectItem value="Custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
                {editJobFormData.serviceSubType === 'Custom' && (
                  <Input
                    className="mt-2"
                    placeholder="Enter custom service sub type"
                    value={editJobFormData.serviceSubTypeCustom}
                    onChange={(e) => setEditJobFormData(prev => ({ ...prev, serviceSubTypeCustom: e.target.value }))}
                  />
                )}
              </div>

              <div>
                <Label htmlFor="edit-scheduled-date">Scheduled Date</Label>
                <Input
                  id="edit-scheduled-date"
                  type="date"
                  value={editJobFormData.scheduledDate}
                  onChange={(e) => setEditJobFormData(prev => ({ ...prev, scheduledDate: e.target.value }))}
                />
              </div>

              <div>
                <Label htmlFor="edit-time-slot">Time Slot</Label>
                <Select 
                  value={editJobFormData.scheduledTimeSlot} 
                  onValueChange={(value) => setEditJobFormData(prev => ({ ...prev, scheduledTimeSlot: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select time slot" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MORNING">Morning (9 AM - 1 PM)</SelectItem>
                    <SelectItem value="AFTERNOON">Afternoon (1 PM - 6 PM)</SelectItem>
                    <SelectItem value="EVENING">Evening (6 PM - 9 PM)</SelectItem>
                    <SelectItem value="FLEXIBLE">Flexible</SelectItem>
                    <SelectItem value="CUSTOM">Custom Time</SelectItem>
                  </SelectContent>
                </Select>
                {editJobFormData.scheduledTimeSlot === 'CUSTOM' && (
                  <Input
                    className="mt-2"
                    type="time"
                    value={editJobFormData.scheduledTimeCustom}
                    onChange={(e) => setEditJobFormData(prev => ({ ...prev, scheduledTimeCustom: e.target.value }))}
                  />
                )}
              </div>


            </div>

            <div>
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={editJobFormData.description}
                onChange={(e) => setEditJobFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Job description and special instructions..."
                rows={3}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit-lead-source">Lead Source</Label>
                <Select 
                  value={editJobFormData.lead_source} 
                  onValueChange={(value) => setEditJobFormData(prev => ({ ...prev, lead_source: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select lead source" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Website">Website</SelectItem>
                    <SelectItem value="Direct call">Direct call</SelectItem>
                    <SelectItem value="RO care india">RO care india</SelectItem>
                    <SelectItem value="Home triangle">Home triangle</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {editJobFormData.lead_source === 'Other' && (
                <div>
                  <Label htmlFor="edit-lead-source-custom">Custom Lead Source</Label>
                  <Input
                    id="edit-lead-source-custom"
                    value={editJobFormData.lead_source_custom}
                    onChange={(e) => setEditJobFormData(prev => ({ ...prev, lead_source_custom: e.target.value }))}
                    placeholder="Enter custom lead source"
                  />
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditJobDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleEditJobSubmit}>
              Update Job
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      {/* Deny Job Dialog */}
      <Dialog open={denyDialogOpen} onOpenChange={setDenyDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Deny Job</DialogTitle>
            <DialogDescription>
              Please provide a reason for denying this job.
            </DialogDescription>
          </DialogHeader>
          
          {selectedJobForDeny && (
            <div className="p-3 bg-gray-50 rounded-lg mb-4">
              <div className="text-sm font-medium text-gray-900">
                Job: {(selectedJobForDeny as any).job_number || selectedJobForDeny.jobNumber}
              </div>
              <div className="text-sm text-gray-600">
                {((selectedJobForDeny as any).service_type || selectedJobForDeny.serviceType || 'N/A')} - {((selectedJobForDeny as any).service_sub_type || selectedJobForDeny.serviceSubType || 'N/A')}
              </div>
              <div className="text-sm text-gray-600">
                Customer: {(selectedJobForDeny.customer as any)?.full_name || selectedJobForDeny.customer?.fullName || 'Unknown'}
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <Label htmlFor="deny-reason">Reason for Denial *</Label>
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
                  className="mt-1 pr-10"
                  required
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

          <DialogFooter>
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
              disabled={!denyReason.trim()}
              variant="destructive"
            >
              Deny Job
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Complete Job Dialog */}
      <Dialog open={completeDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setCompleteDialogOpen(false);
          setSelectedJobForComplete(null);
          setCompletionNotes('');
          setCompleteJobStep(1);
          setBillAmount('');
          setBillPhotos([]);
          const today = new Date().toISOString().split('T')[0];
          setAmcDateGiven(today);
          setAmcEndDate('');
          setAmcYears(1);
          setAmcIncludesPrefilter(false);
          setHasAMC(false);
          setPaymentMode('');
          setCustomerHasPrefilter(null);
          setQrCodeType('');
          setSelectedQrCodeId('');
          setTechnicianQrCode('');
          setTechnicianName('');
          setPaymentScreenshot('');
        }
      }}>
        <DialogContent className="w-[95vw] sm:w-[500px] max-w-[500px] h-[85vh] sm:h-[600px] max-h-[85vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-4 flex-shrink-0 border-b">
            <DialogTitle>Complete Job</DialogTitle>
            <DialogDescription>
              {completeJobStep === 1 && 'Upload bill photo (optional)'}
              {completeJobStep === 2 && 'Enter the bill amount for this job'}
              {completeJobStep === 3 && 'Select payment mode and QR code'}
              {completeJobStep === 4 && 'Upload payment screenshot (optional)'}
              {completeJobStep === 5 && 'Add AMC information (optional)'}
              {completeJobStep === 6 && 'Does the customer have a prefilter?'}
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

            {/* Step Indicator */}
            <div className="flex items-center justify-center mb-6">
              <div className="flex items-center space-x-1 sm:space-x-2">
                <div className={`flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-full text-xs sm:text-sm ${completeJobStep >= 1 ? 'bg-black text-white' : 'bg-gray-200 text-gray-600'}`}>
                  1
                </div>
                <div className={`w-8 sm:w-12 h-1 ${completeJobStep >= 2 ? 'bg-black' : 'bg-gray-200'}`}></div>
                <div className={`flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-full text-xs sm:text-sm ${completeJobStep >= 2 ? 'bg-black text-white' : 'bg-gray-200 text-gray-600'}`}>
                  2
                </div>
                <div className={`w-8 sm:w-12 h-1 ${completeJobStep >= 3 ? 'bg-black' : 'bg-gray-200'}`}></div>
                <div className={`flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-full text-xs sm:text-sm ${completeJobStep >= 3 ? 'bg-black text-white' : 'bg-gray-200 text-gray-600'}`}>
                  3
                </div>
                <div className={`w-8 sm:w-12 h-1 ${completeJobStep >= 4 ? 'bg-black' : 'bg-gray-200'}`}></div>
                <div className={`flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-full text-xs sm:text-sm ${completeJobStep >= 4 ? 'bg-black text-white' : 'bg-gray-200 text-gray-600'}`}>
                  4
                </div>
                <div className={`w-8 sm:w-12 h-1 ${completeJobStep >= 5 ? 'bg-black' : 'bg-gray-200'}`}></div>
                <div className={`flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-full text-xs sm:text-sm ${completeJobStep >= 5 ? 'bg-black text-white' : 'bg-gray-200 text-gray-600'}`}>
                  5
                </div>
              </div>
            </div>

            {/* Step 1: Bill Photo */}
            {completeJobStep === 1 && (
              <div className="space-y-4">
                <div>
                  <Label>Upload Bill Photo (Optional)</Label>
                  <ImageUpload
                    onImagesChange={(images) => setBillPhotos(images)}
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

            {/* Step 2: Bill Amount */}
            {completeJobStep === 2 && (
          <div className="space-y-4">
                <div>
                  <Label htmlFor="bill-amount">Bill Amount *</Label>
                  <Input
                    id="bill-amount"
                    type="number"
                    placeholder="Enter bill amount"
                    value={billAmount}
                    onChange={(e) => setBillAmount(e.target.value)}
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
                onChange={(e) => setCompletionNotes(e.target.value)}
                rows={3}
                className="mt-1"
              />
            </div>
          </div>
            )}

            {/* Step 3: Payment Mode */}
            {completeJobStep === 3 && (
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
                        setCustomerQrPhotos([]);
                        setTechnicianQrCode('');
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
                          if (value.startsWith('common_')) {
                            setQrCodeType('common');
                          } else if (value.startsWith('technician_')) {
                            setQrCodeType('technician');
                          }
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

            {/* Step 4: Payment Screenshot (only for ONLINE payment) */}
            {completeJobStep === 4 && paymentMode === 'ONLINE' && (
              <div className="space-y-4">
                <div>
                  <Label>Payment Screenshot (Optional)</Label>
                  <p className="text-sm text-gray-500 mb-2">Upload payment confirmation screenshot</p>
                  <ImageUpload
                    onImagesChange={(images) => setPaymentScreenshot(images[0] || '')}
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

            {/* Step 5: AMC Info */}
            {completeJobStep === 5 && (
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="has-amc"
                    checked={hasAMC}
                    onChange={(e) => {
                      setHasAMC(e.target.checked);
                      // Reset to default when enabling AMC
                      if (e.target.checked) {
                        const today = new Date().toISOString().split('T')[0];
                        setAmcDateGiven(today);
                        setAmcYears(1);
                        calculateAMCEndDate(today, 1);
                      }
                    }}
                    className="w-4 h-4"
                  />
                  <Label htmlFor="has-amc" className="cursor-pointer">This job includes AMC</Label>
                </div>

                {hasAMC && (
                  <div className="space-y-4 pl-6 border-l-2 border-gray-200">
                    <div>
                      <Label htmlFor="amc-date-given">AMC Date of Agreement *</Label>
                      <Input
                        id="amc-date-given"
                        type="date"
                        value={amcDateGiven}
                        onChange={(e) => {
                          setAmcDateGiven(e.target.value);
                          if (e.target.value) {
                            calculateAMCEndDate(e.target.value, amcYears);
                          }
                        }}
                        className="mt-1"
                        max={new Date().toISOString().split('T')[0]}
                      />
                    </div>
                    <div>
                      <Label htmlFor="amc-years">Number of Years *</Label>
                      <Select value={amcYears.toString()} onValueChange={(value) => {
                        const years = parseInt(value);
                        setAmcYears(years);
                        if (amcDateGiven) {
                          calculateAMCEndDate(amcDateGiven, years);
                        }
                      }}>
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1 Year</SelectItem>
                          <SelectItem value="2">2 Years</SelectItem>
                          <SelectItem value="3">3 Years</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="amc-end-date">AMC End Date *</Label>
                      <Input
                        id="amc-end-date"
                        type="date"
                        value={amcEndDate}
                        onChange={(e) => setAmcEndDate(e.target.value)}
                        className="mt-1"
                        min={amcDateGiven}
                        readOnly
                      />
                    </div>
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="amc-prefilter"
                        checked={amcIncludesPrefilter}
                        onChange={(e) => setAmcIncludesPrefilter(e.target.checked)}
                        className="w-4 h-4"
                      />
                      <Label htmlFor="amc-prefilter" className="cursor-pointer">Includes Prefilter</Label>
                    </div>
                  </div>
                )}
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
                      onClick={() => setCustomerHasPrefilter(true)}
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
                      onClick={() => setCustomerHasPrefilter(false)}
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
                  setAmcYears(1);
                  setAmcIncludesPrefilter(false);
                  setHasAMC(false);
                  setPaymentMode('');
                  setCustomerHasPrefilter(null);
                  setQrCodeType('');
                  setCustomerQrPhotos([]);
                  setTechnicianQrCode('');
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
                  setCompleteJobStep(3);
                }}
              >
                Skip
              </Button>
            )}
            {completeJobStep === 5 && hasAMC && (!amcDateGiven || !amcEndDate) && (
              <Button
                variant="outline"
                onClick={() => {
                  setHasAMC(false);
                  setAmcDateGiven('');
                  setAmcEndDate('');
                  setAmcIncludesPrefilter(false);
                }}
              >
                Skip AMC
              </Button>
            )}
            <Button
              onClick={handleCompleteJobSubmit}
              className="bg-black hover:bg-gray-800 !text-white font-semibold"
              disabled={(completeJobStep === 3 && !paymentMode) || (completeJobStep === 3 && paymentMode === 'ONLINE' && !qrCodeType) || (completeJobStep === 5 && hasAMC && (!amcDateGiven || !amcEndDate))}
            >
              {completeJobStep === 6 ? 'Complete Job' : 'Next'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                setCompleteJobStep(3);
              }}
              className="bg-black hover:bg-gray-800 !text-white font-semibold"
            >
              Confirm & Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Address Dialog */}
      {customers.map((customer) => (
        <Dialog
          key={customer.id}
          open={addressDialogOpen[customer.id] || false}
          onOpenChange={(open) => {
            setAddressDialogOpen(prev => ({ ...prev, [customer.id]: open }));
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Full Address</DialogTitle>
              <DialogDescription>
                Complete address for {customer.fullName || 'Customer'}
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <div className="text-sm text-gray-900 whitespace-pre-wrap break-words">
                {formatAddressForDisplay(customer.address) || 'No address available'}
              </div>
              
              {/* Distance and Time */}
              <div className="pt-3 border-t border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-semibold text-gray-900">Distance & Time</div>
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    onClick={async () => {
                      if (!currentLocation) {
                        toast.error('Your location is not available. Please enable location services.');
                        return;
                      }
                      
                      const customerLocation = extractCoordinates(customer.location);
                      let finalCustomerLocation = customerLocation;
                      
                      // If no coordinates from location, try to extract from Google Maps link
                      if (!finalCustomerLocation || finalCustomerLocation.latitude === 0 || finalCustomerLocation.longitude === 0) {
                        const googleMapsLink = customer.location?.formattedAddress;
                        if (googleMapsLink && (googleMapsLink.includes('google.com/maps') || googleMapsLink.includes('maps.app.goo.gl'))) {
                          finalCustomerLocation = extractCoordinates({ formattedAddress: googleMapsLink });
                        }
                      }
                      
                      if (finalCustomerLocation && finalCustomerLocation.latitude && finalCustomerLocation.longitude) {
                        if (calculateDistanceAndTimeRef.current) {
                          await calculateDistanceAndTimeRef.current(
                            currentLocation,
                            { lat: finalCustomerLocation.latitude, lng: finalCustomerLocation.longitude },
                            customer.id
                          );
                        }
                      } else {
                        toast.error('Customer location coordinates are invalid');
                      }
                    }}
                    disabled={customerDistances[customer.id]?.isCalculating || !currentLocation}
                    className="bg-black hover:bg-gray-800 text-white text-xs h-7 px-2"
                  >
                    {customerDistances[customer.id]?.isCalculating ? (
                      <>
                        <div className="w-2.5 h-2.5 border-2 border-white border-t-transparent rounded-full animate-spin mr-1" />
                        <span className="text-xs">Calculating...</span>
                      </>
                    ) : (
                      <>
                        <MapPin className="w-2.5 h-2.5 mr-1" />
                        <span className="text-xs">Calculate</span>
                      </>
                    )}
                  </Button>
                </div>
                {customerDistances[customer.id] ? (
                  <div className="text-sm">
                    {customerDistances[customer.id].isCalculating ? (
                      <span className="text-gray-500">Calculating...</span>
                    ) : (
                      <div className="flex items-center gap-2 text-black font-medium">
                        <span>{customerDistances[customer.id].distance}</span>
                        {customerDistances[customer.id].duration && (
                          <>
                            <span className="text-gray-400">•</span>
                            <span>{customerDistances[customer.id].duration}</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-gray-500">Click "Calculate" button to get distance and time</div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setAddressDialogOpen(prev => ({ ...prev, [customer.id]: false }));
                }}
              >
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ))}
      
      {/* Description Dialog */}
      <Dialog open={descriptionDialogOpen} onOpenChange={setDescriptionDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Job Description</DialogTitle>
            <DialogDescription>
              Full description for job {(() => {
                const job = jobs.find(j => j.id === selectedJobDescription?.jobId);
                return job?.job_number || job?.jobNumber || selectedJobDescription?.jobId || 'N/A';
              })()}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="prose max-w-none">
              <p className="text-gray-900 whitespace-pre-wrap break-words">
                {selectedJobDescription?.description || 'No description available'}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDescriptionDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Job Address Dialog */}
      {jobs.map((job) => {
        const jobCustomer = job.customer as any;
        const serviceAddress = (job as any)?.service_address || jobCustomer?.address || {};
        const serviceLocation = (job as any)?.service_location || jobCustomer?.location || {};
        
        return (
          <Dialog
            key={job.id}
            open={jobAddressDialogOpen[job.id] || false}
            onOpenChange={(open) => {
              setJobAddressDialogOpen(prev => ({ ...prev, [job.id]: open }));
            }}
          >
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Full Address</DialogTitle>
                <DialogDescription>
                  Complete address for job {job?.job_number || job?.jobNumber || job.id}
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <div className="text-sm text-gray-900 whitespace-pre-wrap break-words">
                  {(() => {
                    const address = serviceAddress;
                    if (!address || (!address.street && !address.area)) {
                      return 'No address available';
                    }
                    
                    const parts = [];
                    if (address.visible_address) {
                      parts.push(`Location: ${address.visible_address}`);
                    }
                    if (address.street) parts.push(address.street);
                    if (address.area) parts.push(address.area);
                    if (address.city) parts.push(address.city);
                    if (address.state) parts.push(address.state);
                    if (address.pincode) parts.push(address.pincode);
                    if (address.landmark) parts.push(`Landmark: ${address.landmark}`);
                    
                    return parts.length > 0 ? parts.join(', ') : 'No address available';
                  })()}
                </div>
                {serviceLocation?.formattedAddress && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <div className="text-xs text-gray-500 mb-2">Google Maps Location:</div>
                    <div className="text-xs text-gray-700 break-all">
                      {serviceLocation.formattedAddress}
                    </div>
                    {serviceLocation?.formattedAddress && (
                      <a
                        href={serviceLocation.formattedAddress}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm font-medium mt-2"
                      >
                        <MapPin className="w-4 h-4" />
                        Open in Google Maps
                      </a>
                    )}
                  </div>
                )}
                {(serviceLocation?.latitude && serviceLocation?.longitude) && (
                  <div className="mt-2">
                    <a
                      href={`https://www.google.com/maps/place/${serviceLocation.latitude},${serviceLocation.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm font-medium"
                    >
                      <MapPin className="w-4 h-4" />
                      Open in Google Maps
                    </a>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setJobAddressDialogOpen(prev => ({ ...prev, [job.id]: false }));
                  }}
                >
                  Close
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })}

      {/* Customer Report Dialog */}
      <Dialog open={customerReportDialogOpen} onOpenChange={setCustomerReportDialogOpen}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Customer Report - {selectedCustomerForReport?.fullName || 'Unknown'}</DialogTitle>
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
                      <span className="text-gray-500">Name:</span> {selectedCustomerForReport.fullName}
                    </div>
                    <div>
                      <span className="text-gray-500">Customer ID:</span> {selectedCustomerForReport.customerId}
                    </div>
                    <div>
                      <span className="text-gray-500">Phone:</span> {selectedCustomerForReport.phone}
                    </div>
                    {selectedCustomerForReport.email && (
                      <div>
                        <span className="text-gray-500">Email:</span> {selectedCustomerForReport.email}
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
                        // Extract completion details (same logic as in job card)
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
                              
                              {/* Payment Screenshot */}
                              {(paymentMethod === 'ONLINE' || paymentMethod === 'UPI' || paymentMethod === 'CARD' || paymentMethod === 'BANK_TRANSFER') && paymentScreenshot && (
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-gray-700 w-32">Payment Screenshot:</span>
                                  <a href={paymentScreenshot} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline">
                                    View Screenshot
                                  </a>
                                </div>
                              )}
                              
                              {/* QR Code */}
                              {(paymentMethod === 'ONLINE' || paymentMethod === 'UPI' || paymentMethod === 'CARD' || paymentMethod === 'BANK_TRANSFER') && qrPhotos?.selected_qr_code_name && (
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-gray-700 w-32">QR Code:</span>
                                  <span className="text-sm text-gray-900">{qrPhotos.selected_qr_code_name}</span>
                                </div>
                              )}
                              
                              {/* AMC Details */}
                              {amcInfo && (
                                <div className="mt-3 pt-3 border-t border-gray-200">
                                  <div className="font-medium text-gray-900 mb-2">AMC Details:</div>
                                  <div className="space-y-1 text-sm">
                                    <div className="flex items-center gap-2">
                                      <span className="text-gray-500 w-32">Start Date:</span>
                                      <span className="text-gray-900">{amcInfo.date_given ? new Date(amcInfo.date_given).toLocaleDateString('en-IN') : 'N/A'}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-gray-500 w-32">End Date:</span>
                                      <span className="text-gray-900">{amcInfo.end_date ? new Date(amcInfo.end_date).toLocaleDateString('en-IN') : 'N/A'}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-gray-500 w-32">Duration:</span>
                                      <span className="text-gray-900">{amcInfo.years || 1} {amcInfo.years === 1 ? 'year' : 'years'}</span>
                                    </div>
                                    {amcInfo.includes_prefilter !== undefined && (
                                      <div className="flex items-center gap-2">
                                        <span className="text-gray-500 w-32">Includes Prefilter:</span>
                                        <span className="text-gray-900">{amcInfo.includes_prefilter ? 'Yes' : 'No'}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                              
                              {/* Completion Notes */}
                              {completionNotes && (
                                <div className="mt-3 pt-3 border-t border-gray-200">
                                  <div className="font-medium text-gray-900 mb-1">Notes:</div>
                                  <div className="text-sm text-gray-700 whitespace-pre-wrap">{completionNotes}</div>
                                </div>
                              )}
                              
                              {/* Bill Photos */}
                              {billPhotos && Array.isArray(billPhotos) && billPhotos.length > 0 && (
                                <div className="mt-3 pt-3 border-t border-gray-200">
                                  <div className="font-medium text-gray-900 mb-2">Bill Photos ({billPhotos.length}):</div>
                                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                    {billPhotos.map((photo, idx) => (
                                      <a key={idx} href={photo} target="_blank" rel="noopener noreferrer" className="block">
                                        <img src={photo} alt={`Bill photo ${idx + 1}`} className="w-full h-24 object-cover rounded border border-gray-200 hover:border-gray-400" />
                                      </a>
                                    ))}
                                  </div>
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

      {/* Edit Completed Job Dialog */}
      <Dialog open={editCompletedJobDialogOpen} onOpenChange={setEditCompletedJobDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Completed Job Details</DialogTitle>
            <DialogDescription>
              Update completion information for {(selectedCompletedJob as any)?.job_number || selectedCompletedJob?.jobNumber}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Amount */}
            <div>
              <Label htmlFor="edit-amount">Amount (₹)</Label>
              <Input
                id="edit-amount"
                type="number"
                value={completedJobEditData.amount || ''}
                onChange={(e) => setCompletedJobEditData({ ...completedJobEditData, amount: e.target.value })}
                placeholder="Enter amount"
              />
            </div>

            {/* Payment Method */}
            <div>
              <Label htmlFor="edit-payment-method">Payment Method</Label>
              <Select
                value={completedJobEditData.paymentMethod || 'CASH'}
                onValueChange={(value) => setCompletedJobEditData({ ...completedJobEditData, paymentMethod: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH">Cash</SelectItem>
                  <SelectItem value="UPI">UPI</SelectItem>
                  <SelectItem value="CARD">Card</SelectItem>
                  <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* QR Code Name (if online payment) */}
            {(completedJobEditData.paymentMethod === 'UPI' || completedJobEditData.paymentMethod === 'CARD' || completedJobEditData.paymentMethod === 'BANK_TRANSFER') && (
              <div>
                <Label htmlFor="edit-qr-code">QR Code Name</Label>
                <Input
                  id="edit-qr-code"
                  value={completedJobEditData.qrCodeName || ''}
                  onChange={(e) => setCompletedJobEditData({ ...completedJobEditData, qrCodeName: e.target.value })}
                  placeholder="Enter QR code name"
                />
              </div>
            )}

            {/* AMC Details */}
            <div className="border-t pt-4">
              <Label className="text-base font-semibold">AMC Details</Label>
              <div className="space-y-3 mt-2">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="amc-start-date">Start Date</Label>
                    <Input
                      id="amc-start-date"
                      type="date"
                      value={completedJobEditData.amcInfo?.date_given ? new Date(completedJobEditData.amcInfo.date_given).toISOString().split('T')[0] : ''}
                      onChange={(e) => {
                        const amcInfo = { ...completedJobEditData.amcInfo, date_given: e.target.value };
                        setCompletedJobEditData({ ...completedJobEditData, amcInfo });
                      }}
                    />
                  </div>
                  <div>
                    <Label htmlFor="amc-end-date">End Date</Label>
                    <Input
                      id="amc-end-date"
                      type="date"
                      value={completedJobEditData.amcInfo?.end_date ? new Date(completedJobEditData.amcInfo.end_date).toISOString().split('T')[0] : ''}
                      onChange={(e) => {
                        const amcInfo = { ...completedJobEditData.amcInfo, end_date: e.target.value };
                        setCompletedJobEditData({ ...completedJobEditData, amcInfo });
                      }}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="amc-years">Duration (Years)</Label>
                    <Input
                      id="amc-years"
                      type="number"
                      value={completedJobEditData.amcInfo?.years || 1}
                      onChange={(e) => {
                        const amcInfo = { ...completedJobEditData.amcInfo, years: parseInt(e.target.value) || 1 };
                        setCompletedJobEditData({ ...completedJobEditData, amcInfo });
                      }}
                    />
                  </div>
                  <div>
                    <Label htmlFor="amc-prefilter">Includes Prefilter</Label>
                    <Select
                      value={completedJobEditData.amcInfo?.includes_prefilter !== undefined ? String(completedJobEditData.amcInfo.includes_prefilter) : 'false'}
                      onValueChange={(value) => {
                        const amcInfo = { ...completedJobEditData.amcInfo, includes_prefilter: value === 'true' };
                        setCompletedJobEditData({ ...completedJobEditData, amcInfo });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">Yes</SelectItem>
                        <SelectItem value="false">No</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>

            {/* Completion Notes */}
            <div>
              <Label htmlFor="edit-notes">Completion Notes</Label>
              <Textarea
                id="edit-notes"
                value={completedJobEditData.completionNotes || ''}
                onChange={(e) => setCompletedJobEditData({ ...completedJobEditData, completionNotes: e.target.value })}
                placeholder="Enter completion notes"
                rows={4}
              />
            </div>

            {/* Completed By */}
            <div>
              <Label htmlFor="edit-completed-by">Completed By</Label>
              <Select
                value={completedJobEditData.completedBy || ''}
                onValueChange={(value) => setCompletedJobEditData({ ...completedJobEditData, completedBy: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select who completed" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  {technicians.map((tech) => (
                    <SelectItem key={tech.id} value={tech.id}>
                      {tech.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditCompletedJobDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
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
                  const updateData: any = {
                    actual_cost: parseFloat(completedJobEditData.amount) || 0,
                    payment_amount: parseFloat(completedJobEditData.amount) || 0,
                    payment_method: completedJobEditData.paymentMethod || 'CASH',
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
                    await loadFilteredJobs();
                  }
                } catch (error: any) {
                  toast.error('Error updating job: ' + error.message);
                }
              }}
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Message Dialog */}
      <Dialog open={sendMessageDialogOpen} onOpenChange={setSendMessageDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Send Completion Confirmation Message</DialogTitle>
            <DialogDescription>
              Send confirmation message to customer for completed job
            </DialogDescription>
          </DialogHeader>
          
          {selectedJobForMessage && (() => {
            const customer = (selectedJobForMessage as any).customer || selectedJobForMessage.customer;
            const customerName = customer?.full_name || customer?.fullName || 'Customer';
            const customerPhone = customer?.phone || '';
            
            // Extract completion details
            const actualCost = (selectedJobForMessage as any).actual_cost || selectedJobForMessage.actual_cost || null;
            const paymentAmount = (selectedJobForMessage as any).payment_amount || selectedJobForMessage.payment_amount || null;
            const amount = actualCost || paymentAmount || 0;
            
            // Generate WhatsApp message template
            const whatsappMessage = `Dear ${customerName},

Thank you for choosing Hydrogen RO! 💧

✅ Your service has been completed successfully.
💰 Amount of ₹${amount} has been collected.

For any queries or support, please contact us:
📞 Phone: +91-8884944288, +91-9886944288
📧 Email: info@hydrogenro.com
🌐 Website: https://hydrogenro.com

📱 For future bookings, you can book directly on https://hydrogenro.com/book for ease and convenience.

Thank you for your trust in Hydrogen RO! 🙏`;

            return (
              <div className="space-y-4 py-4">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="text-sm text-gray-600 mb-2">Customer: <span className="font-medium">{customerName}</span></div>
                  <div className="text-sm text-gray-600">Phone: <span className="font-medium">{customerPhone}</span></div>
                </div>

                <div className="space-y-3">
                  <div>
                    <Label>Message Preview</Label>
                    <div className="mt-2 p-3 bg-gray-50 rounded-md text-sm text-gray-700 whitespace-pre-wrap max-h-40 overflow-y-auto">
                      {whatsappMessage}
                    </div>
                  </div>

                  <Button
                    variant="default"
                    className="w-full bg-green-600 hover:bg-green-700 text-white"
                    onClick={async () => {
                      const whatsappUrl = `https://wa.me/${customerPhone.replace(/\D/g, '')}?text=${encodeURIComponent(whatsappMessage)}`;
                      window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
                      // Mark message as sent
                      await handleMessageSent(selectedJobForMessage.id);
                    }}
                  >
                    <WhatsAppIcon className="w-4 h-4 mr-2" />
                    Send WhatsApp Message
                  </Button>
                </div>
              </div>
            );
          })()}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSendMessageDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminDashboard;