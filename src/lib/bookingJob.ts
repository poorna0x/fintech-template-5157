import { supabase } from '@/lib/supabase';

/** Public /book flow — SECURITY DEFINER RPC (no direct jobs table for anon). */
export async function createBookingJob(phone: string, row: Record<string, unknown>) {
  const { data, error } = await supabase.rpc('create_job_for_booking', {
    p_phone: phone,
    p_row: row,
  });
  return { data: data ?? null, error };
}
