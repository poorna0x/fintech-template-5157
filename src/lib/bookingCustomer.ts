import { supabase } from '@/lib/supabase';

/** Public /book flow only — always uses RLS-safe RPC (never direct customers table). */
export async function getBookingCustomerByPhone(phone: string) {
  const { data, error } = await supabase.rpc('get_customer_by_phone_for_booking', {
    p_phone: phone,
  });
  const row = Array.isArray(data) ? data[0] : data;
  return { data: row ?? null, error };
}

export async function createBookingCustomer(row: Record<string, unknown>) {
  const { data, error } = await supabase.rpc('create_customer_for_booking', {
    p_row: row,
  });
  return { data: data ?? null, error };
}

export async function updateBookingCustomer(
  customerId: string,
  phone: string,
  updates: Record<string, unknown>
) {
  const { data, error } = await supabase.rpc('update_customer_for_booking', {
    p_customer_id: customerId,
    p_phone: phone,
    p_updates: updates,
  });
  return { data: data ?? null, error };
}
