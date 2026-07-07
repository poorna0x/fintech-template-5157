import type { Dispatch, SetStateAction } from 'react';
import { toast } from 'sonner';
import { db } from '@/lib/supabase';
import type { Customer } from '@/types';

export async function updateAdminCustomerStatus(
  customerId: string,
  newStatus: 'ACTIVE' | 'INACTIVE' | 'BLOCKED',
  setCustomers: Dispatch<SetStateAction<Customer[]>>
) {
  try {
    const { error } = await db.customers.update(customerId, { status: newStatus });

    if (error) {
      throw new Error(error.message);
    }

    setCustomers((prev) =>
      prev.map((customer) =>
        customer.id === customerId ? { ...customer, status: newStatus } : customer
      )
    );

    toast.success(`Customer status updated to ${newStatus}`);
  } catch {
    toast.error('Failed to update customer status');
  }
}
