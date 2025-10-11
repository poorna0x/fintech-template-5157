// Customer Types
export interface Customer {
  id: string;
  customerId: string; // Format: C0001, C0002, etc.
  fullName: string;
  phone: string;
  alternatePhone?: string;
  email: string;
  
  // Address Information
  address: {
    street: string;
    area: string;
    city: string;
    state: string;
    pincode: string;
    landmark?: string;
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
  preferredTimeSlot?: 'MORNING' | 'AFTERNOON' | 'EVENING';
  preferredLanguage?: 'ENGLISH' | 'HINDI' | 'KANNADA' | 'TAMIL' | 'TELUGU';
  
  // Service Cost Information
  serviceCost?: number;
  costAgreed?: boolean;
  
  // Timestamps
  createdAt: string;
  updatedAt: string;
}

// Job Types
export interface Job {
  id: string;
  jobNumber: string; // Auto-generated: RO-2024-001
  
  // Customer Info
  customerId: string;
  customer?: Customer;
  
  // Service Details
  serviceType: 'RO' | 'SOFTENER';
  serviceSubType: string; // 'Installation', 'Repair', 'Maintenance'
  brand: string;
  model: string;
  
  // Assignment
  assignedTechnicianId?: string;
  assignedTechnician?: Technician;
  assignedDate?: string;
  assignedBy?: string; // Admin ID
  
  // Scheduling
  scheduledDate: string;
  scheduledTimeSlot: 'MORNING' | 'AFTERNOON' | 'EVENING';
  estimatedDuration: number; // minutes
  
  // Location
  serviceAddress: Customer['address'];
  serviceLocation: Customer['location'];
  
  // Status & Progress
  status: 'PENDING' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'RESCHEDULED' | 'FOLLOW_UP' | 'DENIED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  
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
  afterPhotos?: string[];
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

export interface Bill {
  id: string;
  billNumber: string; // Format: BILL-2024-001
  billDate: string;
  dueDate: string;
  
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
  
  // Related Job/Service
  jobId?: string;
  serviceType?: 'RO' | 'SOFTENER';
  
  // Timestamps
  createdAt: string;
  updatedAt: string;
}

// Database Table Types (for Supabase)
export interface Database {
  public: {
    Tables: {
      customers: {
        Row: Customer;
        Insert: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>;
        Update: Partial<Omit<Customer, 'id' | 'createdAt'>>;
      };
      jobs: {
        Row: Job;
        Insert: Omit<Job, 'id' | 'jobNumber' | 'createdAt' | 'updatedAt'>;
        Update: Partial<Omit<Job, 'id' | 'jobNumber' | 'createdAt'>>;
      };
      technicians: {
        Row: Technician;
        Insert: Omit<Technician, 'id' | 'createdAt' | 'updatedAt'>;
        Update: Partial<Omit<Technician, 'id' | 'createdAt'>>;
      };
      job_assignment_requests: {
        Row: JobAssignmentRequest;
        Insert: Omit<JobAssignmentRequest, 'id' | 'createdAt' | 'updatedAt'>;
        Update: Partial<Omit<JobAssignmentRequest, 'id' | 'createdAt'>>;
      };
      bills: {
        Row: Bill;
        Insert: Omit<Bill, 'id' | 'billNumber' | 'createdAt' | 'updatedAt'>;
        Update: Partial<Omit<Bill, 'id' | 'billNumber' | 'createdAt'>>;
      };
    };
  };
}
