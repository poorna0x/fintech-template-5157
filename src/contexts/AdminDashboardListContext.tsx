import React, {
  createContext,
  useContext,
  useMemo,
  type MutableRefObject,
  type ReactNode,
} from 'react';
import type { Location } from 'react-router-dom';
import type { AdminStatusFilter } from '@/lib/adminDashboardCache';
import type { AdminModalSlug } from '@/lib/adminDashboardUrl';
import type { Customer, Job } from '@/types';
import type { CustomerLocationVariant } from '@/lib/customer-locations';
import type { DocumentBrand } from '@/lib/service-brands';

export interface DisplayedCustomerGroup {
  customer: Customer;
  allJobs: Job[];
  upcomingJobs: Job[];
  completedJobs: Job[];
  cancelledJobs: Job[];
}

export interface AdminDashboardListData {
  displayedCustomers: DisplayedCustomerGroup[];
  statusFilter: AdminStatusFilter;
  todayDateStr: string;
  tomorrowDateStr: string;
  followUpDateToStr: (followUpDate: string | null | undefined) => string | null;
  customerAMCStatus: Record<string, boolean>;
  customerPriorServiceStatus: Record<string, boolean>;
  isLoadingPhotos: boolean;
  selectedCustomerForPhotos: Customer | null;
  currentLocation: { lat: number; lng: number } | null;
  isGettingLocation: boolean;
  customerDistances: Record<
    string,
    { distance: string; duration: string; isCalculating: boolean }
  >;
  technicians: any[];
  techniciansForReports: any[];
  location: Location;
  completedDatePreset: string;
  completedDateFilter: string;
  completedLeadTypeFilter: string;
  completedServiceSubTypeFilter: string;
  completedByFilter: string;
  loadedCompletedJobDetails: Record<string, any>;
  loadingCompletedJobDetails: Record<string, boolean>;
  highlightCompletedJobId: string | null;
  doesOngoingJobMatchFilters: (job: any) => boolean;
  getJobCompletionDate: (job: Job) => number;
  applyListCustomerContactToCachedJob: (cached: any, listJob: any) => any;
}

export interface AdminDashboardListActions {
  handleEditCustomer: (customer: Customer) => void;
  handleNewJob: (customer: Customer) => void;
  handleViewPhotos: (customer: Customer) => void;
  handleGenerateBill: (customer: Customer) => void;
  handleGenerateQuotation: (customer: Customer) => void;
  handleGenerateAMC: (customer: Customer) => void;
  handleGenerateTaxInvoice: (customer: Customer) => void;
  handleOpenCustomerReport: (customer: Customer) => void;
  handleViewAMCInfo: (customer: Customer) => void;
  setReminderEntity: (
    entity: { type: 'customer' | 'job' | 'general'; id: string | null } | null
  ) => void;
  setReminderContextLabel: (label: string) => void;
  openAdminModal: (
    modal: AdminModalSlug,
    params?: {
      jobId?: string;
      customerId?: string;
      photoType?: 'before' | 'after';
      photoIdx?: number;
    }
  ) => void;
  setViewRemindersCustomer: (customer: Customer | null) => void;
  handlePhoneClick: (customer: Customer) => void;
  handleWhatsAppClick: (customer: Customer) => void;
  setCurrentLocation: React.Dispatch<
    React.SetStateAction<{ lat: number; lng: number } | null>
  >;
  setIsGettingLocation: React.Dispatch<React.SetStateAction<boolean>>;
  setAddressDialogOpen: React.Dispatch<
    React.SetStateAction<Record<string, boolean>>
  >;
  setAddressLocationVariant: React.Dispatch<
    React.SetStateAction<Record<string, CustomerLocationVariant>>
  >;
  hydrateCustomerForMaps: (customerId: string) => Promise<Customer | null>;
  setSelectedCompletedJob: React.Dispatch<React.SetStateAction<Job | null>>;
  setCompletedJobEditData: React.Dispatch<React.SetStateAction<any>>;
  setSelectedJobForMessage: React.Dispatch<React.SetStateAction<Job | null>>;
  sendCompletionEmailQuick: (job: Job, brand: DocumentBrand) => Promise<boolean>;
  openCompletionEmailComposer: (job: Job, brand: DocumentBrand) => void;
  setSelectedBillPhotos: React.Dispatch<React.SetStateAction<string[]>>;
  setSelectedPhoto: React.Dispatch<
    React.SetStateAction<{ url: string; index: number; total: number } | null>
  >;
  onAdminModalOpenChange: (modal: AdminModalSlug, open: boolean) => void;
  loadCompletedJobDetails: (jobId: string) => Promise<void>;
  setSelectedJobDescription: React.Dispatch<
    React.SetStateAction<{ jobId: string; description: string } | null>
  >;
  setDescriptionDialogOpen: React.Dispatch<React.SetStateAction<boolean>>;
  openPhotoGallery: (
    jobId: string,
    photos: string[],
    type: 'before' | 'after' | 'photos'
  ) => void;
  handleAssignJob: (job: Job) => void;
  handleCompleteJob: (job: Job) => void;
  handleJobStatusUpdate: (jobId: string, status: string) => void;
  handleAddTeam: (job: Job) => void;
  handleRemoveTeam: (job: Job) => void;
  handleScheduleFollowUp: (job: Job) => void;
  handleDenyJob: (job: Job) => void;
  handleAssignFromFollowUp: (job: Job) => void;
  handleMoveToOngoing: (job: Job) => void;
  handleEditJob: (job: Job) => void;
  handleReassignJob: (job: Job) => void;
  handleUnassignJob: (job: Job) => void;
  handleMeasureDistance: (job: Job) => void;
  handleShareJobWhatsApp: (job: Job) => void;
}

interface AdminDashboardListContextValue {
  data: AdminDashboardListData;
  actionsRef: MutableRefObject<AdminDashboardListActions>;
}

const AdminDashboardListContext = createContext<AdminDashboardListContextValue | null>(
  null
);

export function AdminDashboardListProvider({
  data,
  actionsRef,
  children,
}: {
  data: AdminDashboardListData;
  actionsRef: MutableRefObject<AdminDashboardListActions>;
  children: ReactNode;
}) {
  const value = useMemo(
    () => ({ data, actionsRef }),
    [data, actionsRef]
  );

  return (
    <AdminDashboardListContext.Provider value={value}>
      {children}
    </AdminDashboardListContext.Provider>
  );
}

export function useAdminDashboardList(): AdminDashboardListContextValue {
  const ctx = useContext(AdminDashboardListContext);
  if (!ctx) {
    throw new Error('useAdminDashboardList must be used within AdminDashboardListProvider');
  }
  return ctx;
}
