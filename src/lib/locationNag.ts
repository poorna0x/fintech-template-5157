import { Capacitor, registerPlugin } from '@capacitor/core';
import { supabase } from '@/lib/supabase';

const LocationNag = registerPlugin<{ setEnabled(options: { enabled: boolean }): Promise<void> }>(
  'LocationNag'
);

/** Tell the installed technician app whether the 8 AM–8 PM location prompt is on. */
export async function syncTechnicianLocationNag(technicianId: string): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;
  const { data, error } = await supabase
    .from('technicians')
    .select('location_nag_enabled')
    .eq('id', technicianId)
    .maybeSingle();
  if (error) return;
  const enabled = (data as { location_nag_enabled?: boolean } | null)?.location_nag_enabled === true;
  try {
    await LocationNag.setEnabled({ enabled });
  } catch {
    /* APK older than 4.08 has no plugin. */
  }
}
