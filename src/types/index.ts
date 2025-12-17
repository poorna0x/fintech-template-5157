// Customer Types
export interface Customer {
  id: string;
  customerId: string; // Format: C0001, C0002, etc.
  customer_id?: string; // Alternative field name used in database
  fullName: string;
  full_name?: string; // Alternative field name used in database
  phone: string;
  alternatePhone?: string;
  alternate_phone?: string; // Alternative field name used in database
  email: string;
  
  // Address Information
  address: {
    street: string;
    area: string;
    city: string;
    state: string;
    pincode: string;
    landmark?: string;
    visible_address?: string; // One-word identifier for quick recognition
  };
  
  // Location Data (Google Maps Integration)
  location: {
    latitude: number;
    longitude: number;
    formattedAddress: string;
    googlePlaceId?: string;
  };
  
  // Service Information
  serviceType: 'RO' | 'SOFTENER';
  service_type?: string; // Alternative field name used in database
  brand: string;
  model: string;
  installationDate?: string;
  warrantyExpiry?: string;
  
  // Customer Status
  status: 'ACTIVE' | 'INACTIVE' | 'BLOCKED';
  customerSince: string;
  lastServiceDate?: string;
  
  // Additional Info
  notes?: string;
  behavior?: string; // Customer behavior notes
  preferredTimeSlot?: 'MORNING' | 'AFTERNOON' | 'EVENING' | 'CUSTOM';
  customTime?: string; // Exact time in HH:MM format when preferredTimeSlot is CUSTOM
  preferredLanguage?: 'ENGLISH' | 'HINDI' | 'KANNADA' | 'TAMIL' | 'TELUGU';
  
  // Service Cost Information
  serviceCost?: number;
  costAgreed?: boolean;
  
  // Prefilter Information
  hasPrefilter?: boolean;
  has_prefilter?: boolean; // Alternative field name used in database
  
  // Timestamps
  createdAt: string;
  updatedAt: string;
}

// Job Types
export interface Job {
  id: string;
  jobNumber: string; // Auto-generated: RO-2024-001
  job_number?: string; // Alternative field name used in database
  
  // Customer Info
  customerId?: string | null; // Nullable for dummy/manual bill entry jobs
  customer_id?: string | null; // Alternative field name used in database, nullable for dummy jobs
  customer?: Customer;
  
  // Service Details
  serviceType: 'RO' | 'SOFTENER';
  service_type?: string; // Alternative field name used in database
  serviceSubType: string; // 'Installation', 'Repair', 'Maintenance'
  service_sub_type?: string; // Alternative field name used in database
  brand: string;
  model: string;
  
  // Assignment
  assignedTechnicianId?: string;
  assigned_technician_id?: string; // Alternative field name used in database
  assignedTechnician?: Technician;
  assignedDate?: string;
  assignedBy?: string; // Admin ID
  
  // Scheduling
  scheduledDate: string;
  scheduled_date?: string; // Alternative field name used in database
  scheduledTimeSlot: 'MORNING' | 'AFTERNOON' | 'EVENING' | 'CUSTOM';
  scheduled_time_slot?: string; // Alternative field name used in database
  estimatedDuration: number; // minutes
  
  // Location
  serviceAddress: Customer['address'];
  serviceLocation: Customer['location'];
  
  // Status & Progress
  status: 'PENDING' | 'ASSIGNED' | 'EN_ROUTE' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'RESCHEDULED' | 'FOLLOW_UP' | 'DENIED' | string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' | string;
  
  // Job Details
  description: string;
  requirements: string[];
  estimated_cost: number;
  actual_cost?: number;
  
  // Tracking
  start_time?: string;
  end_time?: string;
  actual_duration?: number;
  
  // Customer Interaction
  customerFeedback?: {
    rating: number;
    comments: string;
    photos?: string[];
  };
  
  // Financial
  payment_status: 'PENDING' | 'PAID' | 'PARTIAL' | 'REFUNDED';
  payment_method?: 'CASH' | 'CARD' | 'UPI' | 'BANK_TRANSFER';
  payment_amount?: number;
  
  // Documents
  beforePhotos?: string[];
  before_photos?: string[]; // Alternative field name used in database
  afterPhotos?: string[];
  after_photos?: string[]; // Alternative field name used in database
  images?: string[]; // General images field used in database
  invoice?: string;
  warranty?: string;
  
  // Follow-up Tracking
  followUpDate?: string;
  followUpTime?: string;
  followUpNotes?: string;
  followUpScheduledBy?: string;
  followUpScheduledAt?: string;
  
  // Denial Tracking
  denialReason?: string;
  deniedBy?: string;
  deniedAt?: string;
  
  // Completion Tracking
  completionNotes?: string;
  completedBy?: string;
  completedAt?: string;

  // Timestamps
  createdAt: string;
  updatedAt: string;
}

// Technician Types
export interface Technician {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  employeeId: string;
  
  // Skills & Certifications
  skills: {
    serviceTypes: ('RO' | 'SOFTENER')[];
    certifications: string[];
    experience: number; // in years
    rating: number; // 1-5 stars
  };
  
  // Service Areas
  serviceAreas: {
    pincodes: string[];
    cities: string[];
    maxDistance: number; // in km
  };
  
  // Current Status
  status: 'AVAILABLE' | 'BUSY' | 'OFFLINE' | 'ON_BREAK';
  currentLocation?: {
    latitude: number;
    longitude: number;
    lastUpdated: string;
  };
  
  // Work Schedule
  workSchedule: {
    workingDays: ('MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN')[];
    startTime: string; // "09:00"
    endTime: string; // "18:00"
    breakTime?: {
      start: string;
      end: string;
    };
  };
  
  // Performance Metrics
  performance: {
    totalJobs: number;
    completedJobs: number;
    averageRating: number;
    onTimePercentage: number;
    customerSatisfaction: number;
  };
  
  // Vehicle/Equipment
  vehicle?: {
    type: 'BIKE' | 'CAR' | 'VAN';
    number: string;
    capacity: number; // for parts/tools
  };
  
  // Financial
  salary: {
    baseSalary: number;
    commissionPerJob: number;
    commissionPercentage: number;
  };
  
  // QR Code Visibility
  visibleQrCodes?: string[]; // Array of QR code IDs visible to this technician. Empty = none, ["all"] = all, or specific IDs
  
  // Timestamps
  createdAt: string;
  updatedAt: string;
}

// Job Assignment Request Types
export interface JobAssignmentRequest {
  id: string;
  jobId: string;
  job?: Job; // Populated when fetching with joins
  technicianId: string;
  technician?: Technician; // Populated when fetching with joins
  
  // Request Status
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';
  
  // Assignment Details
  assignedBy?: string; // Admin ID who sent the request
  assignedAt: string;
  
  // Response Details
  respondedAt?: string;
  responseNotes?: string; // Optional notes from technician
  
  // Timestamps
  createdAt: string;
  updatedAt: string;
}

// Booking Form Types
export interface BookingFormData {
  // Customer Info
  fullName: string;
  phone: string;
  alternatePhone?: string;
  email: string;
  
  // Address
  address: {
    street: string;
    area: string;
    city: string;
    state: string;
    pincode: string;
    landmark?: string;
  };
  
  // Location
  location: {
    latitude: number;
    longitude: number;
    formattedAddress: string;
    googlePlaceId?: string;
  };
  
  // Service Details
  serviceType: 'RO' | 'SOFTENER';
  serviceSubType: 'Installation' | 'Repair' | 'Maintenance' | 'AMC';
  brand: string;
  model: string;
  
  // Scheduling
  preferredDate: string;
  preferredTimeSlot: 'MORNING' | 'AFTERNOON' | 'EVENING';
  
  // Additional Info
  description: string;
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  preferredLanguage: 'ENGLISH' | 'HINDI' | 'KANNADA' | 'TAMIL' | 'TELUGU';
}

// API Response Types
export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  success: boolean;
}

// Bill Generation Types
export interface BillItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  taxRate: number; // GST rate in percentage
  taxAmount: number;
}

export interface CompanyInfo {
  name: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  phone: string;
  email: string;
  gstNumber: string;
  panNumber: string;
  website?: string;
}

export interface BankDetails {
  bankName?: string;
  accountNumber?: string;
  ifscCode?: string;
  branchName?: string;
  accountHolderName?: string;
  accountType?: string;
  upiId?: string;
  note?: string;
}

export interface Bill {
  id: string;
  billNumber: string; // Format: BILL-2024-001
  billDate: string;
  dueDate?: string;
  
  // Company Information
  company: CompanyInfo;
  
  // Customer Information
  customer: {
    id: string;
    name: string;
    address: string;
    city: string;
    state: string;
    pincode: string;
    phone: string;
    email: string;
    gstNumber?: string;
  };
  
  // Bill Items
  items: BillItem[];
  
  // Financial Summary
  subtotal: number;
  totalTax: number;
  serviceCharge?: number;
  totalAmount: number;
  
  // Payment Information
  paymentStatus: 'PENDING' | 'PAID' | 'OVERDUE';
  paymentMethod?: 'CASH' | 'CARD' | 'UPI' | 'BANK_TRANSFER' | 'CHEQUE';
  paymentDate?: string;
  
  // Additional Information
  notes?: string;
  terms?: string;
  validity?: string; // AMC validity period
  agreementIntro?: string; // AMC agreement introduction text
  bankDetails?: BankDetails;
  
  // Related Job/Service
  jobId?: string;
  serviceType?: 'RO' | 'SOFTENER';
  
  // Timestamps
  createdAt: string;
  updatedAt: string;
}

// Database Table Types (for Supabase) - matches actual schema with snake_case
export interface Database {
  public: {
    Tables: {
      customers: {
        Row: {
          id: string;
          customer_id: string;
          full_name: string;
          phone: string;
          alternate_phone?: string;
          email: string;
          address: any;
          location: any;
          service_type: string;
          brand: string;
          model: string;
          installation_date?: string;
          warranty_expiry?: string;
          status: string;
          customer_since: string;
          last_service_date?: string;
          notes?: string;
          preferred_time_slot?: string;
          preferred_language?: string;
          service_cost?: number;
          cost_agreed?: boolean;
          has_prefilter?: boolean | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['customers']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Database['public']['Tables']['customers']['Row'], 'id' | 'created_at'>>;
      };
      jobs: {
        Row: Job;
        Insert: Omit<Job, 'id' | 'createdAt' | 'updatedAt'>;
        Update: Partial<Omit<Job, 'id' | 'createdAt'>>;
      };
      technicians: {
        Row: {
          id: string;
          full_name: string;
          phone: string;
          email: string;
          employee_id: string;
          skills: any;
          service_areas: any;
          status: string;
          current_location?: any;
          work_schedule: any;
          performance: any;
          vehicle?: any;
          salary: any;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['technicians']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Database['public']['Tables']['technicians']['Row'], 'id' | 'created_at'>>;
      };
      job_assignment_requests: {
        Row: {
          id: string;
          job_id: string;
          technician_id: string;
          status: string;
          assigned_by?: string;
          assigned_at: string;
          responded_at?: string;
          response_notes?: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['job_assignment_requests']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Database['public']['Tables']['job_assignment_requests']['Row'], 'id' | 'created_at'>>;
      };
      bills: {
        Row: Bill;
        Insert: Omit<Bill, 'id' | 'billNumber' | 'createdAt' | 'updatedAt'>;
        Update: Partial<Omit<Bill, 'id' | 'billNumber' | 'createdAt'>>;
      };
      admin_todos: {
        Row: {
          id: string;
          text: string;
          created_at: string;
        };
        Insert: {
          text: string;
        };
        Update: Partial<{
          text: string;
        }>;
      };
    };
  };
}
