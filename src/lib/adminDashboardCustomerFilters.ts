import type { AdminStatusFilter } from '@/lib/adminDashboardCache';
import { getJobCompletionDate, followUpDateToStr } from '@/lib/adminDashboardDateHelpers';
import { transformCustomerData } from '@/lib/adminDashboardTransforms';
import type { Customer, Job } from '@/types';

export interface CustomerJobGroup {
  customer: Customer;
  allJobs: Job[];
  upcomingJobs: Job[];
  completedJobs: Job[];
  cancelledJobs: Job[];
}

function createOrphanCustomerPlaceholder(fallbackCustomerId: string): Customer {
  return {
    id: fallbackCustomerId,
    customer_id: null,
    full_name: 'Customer record unavailable',
    phone: '',
    alternate_phone: null,
    email: null,
    visible_address: '',
    address: {},
    location: null,
    service_type: null,
    brand: null,
    model: null,
    installation_date: null,
    warranty_expiry: null,
    status: null,
    customer_since: null,
    last_service_date: null,
    notes: null,
    preferred_time_slot: null,
    preferred_language: null,
    has_prefilter: null,
    has_google_review: null,
    customer_tier: null,
    raw_water_tds: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as Customer;
}

export function buildCustomersWithJobs(
  baseCustomers: Customer[],
  jobs: Job[]
): CustomerJobGroup[] {
  return baseCustomers.map((customer) => {
    const customerJobs = jobs
      .filter((job) => {
        const jobCustomerId =
          (job as any).customer_id || job.customerId || (job as any).customerId;
        return jobCustomerId === customer.id;
      })
      .sort((a, b) => {
        const aDate = new Date(
          (a as any).scheduled_date || a.scheduledDate
        ).getTime();
        const bDate = new Date(
          (b as any).scheduled_date || b.scheduledDate
        ).getTime();
        return bDate - aDate;
      });

    const completedJobs = customerJobs
      .filter((job) => job.status === 'COMPLETED')
      .sort(
        (a, b) => getJobCompletionDate(b) - getJobCompletionDate(a)
      );

    return {
      customer,
      allJobs: customerJobs,
      upcomingJobs: customerJobs.filter((job) =>
        ['PENDING', 'ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS'].includes(job.status)
      ),
      completedJobs,
      cancelledJobs: customerJobs.filter((job) => job.status === 'CANCELLED'),
    };
  });
}

export type GetFilteredCustomersParams = {
  statusFilter: AdminStatusFilter;
  jobs: Job[];
  baseCustomers: Customer[];
  customersWithJobs: CustomerJobGroup[];
  completedDateFilter: string;
  currentPage: number;
  totalPages: number;
  totalCount: number;
  doesCompletedJobMatchFilters: (job: Job) => boolean;
  doesOngoingJobMatchFilters: (job: any) => boolean;
};

export function getFilteredCustomersForDashboard({
  statusFilter,
  jobs,
  baseCustomers,
  customersWithJobs,
  completedDateFilter,
  currentPage,
  totalPages,
  totalCount,
  doesCompletedJobMatchFilters,
  doesOngoingJobMatchFilters,
}: GetFilteredCustomersParams): CustomerJobGroup[] {
  if (statusFilter === 'COMPLETED' || statusFilter === 'CANCELLED') {
    const customerMap = new Map<string, { customer: Customer; todayJobs: Job[] }>();

    jobs.forEach((job) => {
      let customer = (job as any).customer || job.customer;
      const fallbackCustomerId = (job as any).customer_id || (job as any).customerId;
      if (!customer) {
        if (!fallbackCustomerId) {
          if (import.meta.env.DEV) {
            console.warn('Job missing customer relationship:', {
              jobId: job.id,
              jobNumber: job.job_number || job.jobNumber,
              hasCustomerField: !!(job as any).customer || !!job.customer,
              status: job.status,
              completedAt: (job as any).completed_at || job.completedAt,
              endTime: (job as any).end_time || job.endTime,
            });
          }
          return;
        }
        customer = createOrphanCustomerPlaceholder(fallbackCustomerId);
      }

      const customerId = customer.id;
      if (!customerId) {
        if (import.meta.env.DEV) {
          console.warn('Customer missing ID:', customer);
        }
        return;
      }

      if (!customerMap.has(customerId)) {
        customerMap.set(customerId, {
          customer: transformCustomerData(customer),
          todayJobs: [],
        });
      }
      customerMap.get(customerId)!.todayJobs.push(job);
    });

    if (import.meta.env.DEV && statusFilter === 'COMPLETED') {
      console.log('Completed jobs filter - customer grouping:', {
        totalJobs: jobs.length,
        uniqueCustomers: customerMap.size,
        dateFilter: completedDateFilter,
        currentPage,
        totalPages,
        totalCount,
        customers: Array.from(customerMap.entries()).map(
          ([id, { customer, todayJobs }]) => ({
            customerId: id,
            customer_id: (customer as any).customer_id || customer.customerId,
            name: customer.fullName || (customer as any).full_name,
            jobCount: todayJobs.length,
            jobNumbers: todayJobs.map((j) => j.job_number || j.jobNumber),
          })
        ),
      });
    }

    return Array.from(customerMap.values())
      .map(({ customer, todayJobs }) => {
        const allJobs =
          statusFilter === 'COMPLETED'
            ? todayJobs.filter(
                (job) =>
                  job.status === 'COMPLETED' && doesCompletedJobMatchFilters(job)
              )
            : todayJobs;

        const completedJobs = allJobs
          .filter((job) => job.status === 'COMPLETED')
          .sort(
            (a, b) => getJobCompletionDate(b) - getJobCompletionDate(a)
          );

        return {
          customer,
          allJobs,
          upcomingJobs: allJobs.filter((job) =>
            ['PENDING', 'ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS'].includes(
              job.status
            )
          ),
          completedJobs,
          cancelledJobs: allJobs.filter(
            (job) => job.status === 'CANCELLED' || job.status === 'DENIED'
          ),
        };
      })
      .filter(
        (entry) => statusFilter !== 'COMPLETED' || entry.completedJobs.length > 0
      )
      .sort((a, b) => {
        const aMostRecentCompleted =
          a.completedJobs.length > 0
            ? getJobCompletionDate(a.completedJobs[0])
            : 0;
        const bMostRecentCompleted =
          b.completedJobs.length > 0
            ? getJobCompletionDate(b.completedJobs[0])
            : 0;
        return bMostRecentCompleted - aMostRecentCompleted;
      });
  }

  let filteredCustomers = customersWithJobs;

  if (statusFilter === 'ALL') {
    filteredCustomers = customersWithJobs;
  } else if (statusFilter === 'ONGOING') {
    filteredCustomers = customersWithJobs.filter(({ allJobs }) =>
      allJobs.some((job: any) => doesOngoingJobMatchFilters(job))
    );
  } else if (statusFilter === 'RESCHEDULED') {
    if (
      jobs.length > 0 &&
      jobs.some((j) => ['FOLLOW_UP', 'RESCHEDULED'].includes(j.status))
    ) {
      const customerMap = new Map<string, { customer: Customer; allJobs: Job[] }>();
      const existingCustomerIds = new Set(baseCustomers.map((c) => c.id));

      jobs.forEach((job) => {
        const customer = (job as any).customer || job.customer;
        if (!customer) return;
        const customerId = customer.id;

        if (!existingCustomerIds.has(customerId)) {
          if (import.meta.env.DEV) {
            console.warn('Skipping RESCHEDULED job with deleted customer:', {
              jobId: job.id,
              jobNumber: job.job_number || job.jobNumber,
              customerId,
            });
          }
          return;
        }

        if (!customerMap.has(customerId)) {
          customerMap.set(customerId, {
            customer: transformCustomerData(customer),
            allJobs: [],
          });
        }
        customerMap.get(customerId)!.allJobs.push(job);
      });

      const customersList = Array.from(customerMap.values()).map(
        ({ customer, allJobs }) => {
          const completedJobs = allJobs
            .filter((job) => job.status === 'COMPLETED')
            .sort(
              (a, b) => getJobCompletionDate(b) - getJobCompletionDate(a)
            );

          return {
            customer,
            allJobs,
            upcomingJobs: allJobs.filter((job) =>
              ['PENDING', 'ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS'].includes(
                job.status
              )
            ),
            completedJobs,
            cancelledJobs: allJobs.filter(
              (job) => job.status === 'CANCELLED' || job.status === 'DENIED'
            ),
          };
        }
      );

      return customersList;
    }

    filteredCustomers = customersWithJobs.filter(({ allJobs }) =>
      allJobs.some((job) => ['FOLLOW_UP', 'RESCHEDULED'].includes(job.status))
    );
  } else if (statusFilter === 'CANCELLED') {
    filteredCustomers = customersWithJobs.filter(({ allJobs }) =>
      allJobs.some((job) => ['DENIED', 'CANCELLED'].includes(job.status as any))
    );
  } else {
    filteredCustomers = customersWithJobs.filter(({ allJobs }) =>
      allJobs.some((job) => job.status === statusFilter)
    );
  }

  return filteredCustomers;
}

function sortDisplayedCustomerGroups(
  filtered: CustomerJobGroup[],
  statusFilter: AdminStatusFilter,
  todayDateStr: string,
  tomorrowDateStr: string,
  doesOngoingJobMatchFilters: (job: any) => boolean
): CustomerJobGroup[] {
  if (statusFilter === 'COMPLETED') {
    return filtered.sort((a, b) => {
      const aMostRecentCompleted =
        a.completedJobs.length > 0
          ? getJobCompletionDate(a.completedJobs[0])
          : 0;
      const bMostRecentCompleted =
        b.completedJobs.length > 0
          ? getJobCompletionDate(b.completedJobs[0])
          : 0;
      return bMostRecentCompleted - aMostRecentCompleted;
    });
  }

  if (statusFilter === 'ONGOING') {
    return filtered.sort((a, b) => {
      const getMostRecentOngoingJobDate = (customer: CustomerJobGroup): number => {
        const ongoingJobs = customer.allJobs.filter((job: any) =>
          doesOngoingJobMatchFilters(job)
        );
        if (ongoingJobs.length === 0) return 0;

        const dates = ongoingJobs
          .map((job) => {
            const createdAt = (job as any).created_at || job.createdAt;
            return createdAt ? new Date(createdAt).getTime() : 0;
          })
          .filter((d): d is number => d !== 0)
          .sort((x, y) => y - x);

        return dates.length > 0 ? dates[0] : 0;
      };

      return (
        getMostRecentOngoingJobDate(b) - getMostRecentOngoingJobDate(a)
      );
    });
  }

  if (statusFilter === 'RESCHEDULED') {
    return filtered.sort((a, b) => {
      const getClosestFollowUpRankAndTime = (
        customer: CustomerJobGroup
      ): { rank: number; time: number } | null => {
        const followUpJobs = customer.allJobs.filter((job) =>
          ['FOLLOW_UP', 'RESCHEDULED'].includes(job.status)
        );
        if (followUpJobs.length === 0) return null;
        const withRank = followUpJobs
          .map((job) => {
            const fd = job.followUpDate || (job as any).follow_up_date;
            const dateStr = fd ? followUpDateToStr(fd) : null;
            if (!dateStr) return null;
            const rank =
              dateStr === todayDateStr ? 0 : dateStr === tomorrowDateStr ? 1 : 2;
            const time = new Date(fd).getTime();
            return { rank, time };
          })
          .filter((d): d is { rank: number; time: number } => d !== null)
          .sort((x, y) =>
            x.rank !== y.rank ? x.rank - y.rank : x.time - y.time
          );
        return withRank.length > 0 ? withRank[0] : null;
      };

      const aVal = getClosestFollowUpRankAndTime(a);
      const bVal = getClosestFollowUpRankAndTime(b);
      if (aVal === null && bVal === null) return 0;
      if (aVal === null) return 1;
      if (bVal === null) return -1;
      return aVal.rank !== bVal.rank ? aVal.rank - bVal.rank : aVal.time - bVal.time;
    });
  }

  return filtered.sort((a, b) => {
    const aDate = new Date(a.customer.createdAt).getTime();
    const bDate = new Date(b.customer.createdAt).getTime();
    return bDate - aDate;
  });
}

export type ResolveDisplayedCustomersParams = {
  searchTerm: string;
  statusFilter: AdminStatusFilter;
  searchFilteredCustomers: Customer[];
  customersWithJobs: CustomerJobGroup[];
  todayDateStr: string;
  tomorrowDateStr: string;
  doesOngoingJobMatchFilters: (job: any) => boolean;
  getFilteredCustomers: () => CustomerJobGroup[];
};

export function resolveDisplayedCustomers({
  searchTerm,
  statusFilter,
  searchFilteredCustomers,
  customersWithJobs,
  todayDateStr,
  tomorrowDateStr,
  doesOngoingJobMatchFilters,
  getFilteredCustomers,
}: ResolveDisplayedCustomersParams): CustomerJobGroup[] {
  if (!searchTerm.trim()) {
    const filtered = getFilteredCustomers();
    return sortDisplayedCustomerGroups(
      filtered,
      statusFilter,
      todayDateStr,
      tomorrowDateStr,
      doesOngoingJobMatchFilters
    );
  }

  return searchFilteredCustomers
    .map((customer) => {
      const customerWithJobs = customersWithJobs.find(
        (cwj) => cwj.customer.id === customer.id
      );
      return (
        customerWithJobs || {
          customer,
          allJobs: [],
          upcomingJobs: [],
          completedJobs: [],
          cancelledJobs: [],
        }
      );
    })
    .sort((a, b) => {
      if (statusFilter === 'COMPLETED') {
        const aMostRecentCompleted =
          a.completedJobs.length > 0
            ? getJobCompletionDate(a.completedJobs[0])
            : 0;
        const bMostRecentCompleted =
          b.completedJobs.length > 0
            ? getJobCompletionDate(b.completedJobs[0])
            : 0;
        return bMostRecentCompleted - aMostRecentCompleted;
      }
      const aDate = new Date(a.customer.createdAt).getTime();
      const bDate = new Date(b.customer.createdAt).getTime();
      return bDate - aDate;
    });
}
