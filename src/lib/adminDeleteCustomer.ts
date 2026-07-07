import type { Dispatch, SetStateAction } from 'react';
import { toast } from 'sonner';
import type { AdminStatusFilter } from '@/lib/adminDashboardCache';
import type { LoadFilteredJobsFn } from '@/lib/adminLoadDashboardData';
import { db } from '@/lib/supabase';
import type { Customer, Job } from '@/types';

export async function deleteAdminCustomer(
  ctx: {
    customerToDelete: Customer | null;
    isManager: boolean;
    managerRestrictedTitle: string;
    customers: Customer[];
    statusFilter: AdminStatusFilter;
    currentPage: number;
    setCustomers: Dispatch<SetStateAction<Customer[]>>;
    setJobs: Dispatch<SetStateAction<Job[]>>;
    setCustomerJobs: Dispatch<SetStateAction<Record<string, Job[]>>>;
    setDeleteDialogOpen: Dispatch<SetStateAction<boolean>>;
    setCustomerToDelete: Dispatch<SetStateAction<Customer | null>>;
    loadDashboardData: () => Promise<void>;
    loadFilteredJobs: LoadFilteredJobsFn;
  }
) {
  if (!ctx.customerToDelete) return;
  if (ctx.isManager) {
    toast.error(ctx.managerRestrictedTitle);
    return;
  }

  const customerToDelete = ctx.customerToDelete;

  try {
    const { error, data } = await db.customers.delete(customerToDelete.id);

    if (error) {
      console.error('Delete customer error details:', {
        error,
        customerId: customerToDelete.id,
        customer_id: customerToDelete.customer_id || customerToDelete.customerId,
        errorCode: error.code,
        errorMessage: error.message,
        errorDetails: error.details,
        errorHint: error.hint,
      });
      throw new Error(error.message || 'Failed to delete customer. Check RLS policies.');
    }

    if (data === null || data === undefined) {
      const { data: verifyData } = await db.customers.getById(customerToDelete.id);
      if (verifyData) {
        throw new Error('Customer deletion failed - customer still exists. Check RLS policies.');
      }
    }

    toast.success(
      `Customer ${customerToDelete.customer_id || customerToDelete.customerId} deleted successfully`
    );

    ctx.setCustomers(ctx.customers.filter((c) => c.id !== customerToDelete.id));

    ctx.setJobs((prevJobs) =>
      prevJobs.filter((job) => {
        const jobCustomerId = (job as any).customer_id || job.customerId;
        return jobCustomerId !== customerToDelete.id;
      })
    );

    ctx.setCustomerJobs((prev) => {
      const updated = { ...prev };
      delete updated[customerToDelete.id];
      return updated;
    });

    ctx.setDeleteDialogOpen(false);
    ctx.setCustomerToDelete(null);

    await ctx.loadDashboardData();

    if (ctx.statusFilter === 'COMPLETED' || ctx.statusFilter === 'CANCELLED') {
      await ctx.loadFilteredJobs(ctx.statusFilter, ctx.currentPage);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('Error deleting customer:', error);
    toast.error(`Failed to delete customer: ${errorMessage}`);
  }
}
