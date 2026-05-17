import { supabase } from './supabase';

/** Shared Supabase Broadcast channel — instant job-list refresh when admin assigns/unassigns. */
export const TECHNICIAN_JOB_LIST_BROADCAST_CHANNEL = 'technician-job-list-sync';
export const TECHNICIAN_JOB_LIST_BROADCAST_EVENT = 'refresh';

export function uniqueTechnicianIds(ids: (string | null | undefined)[]): string[] {
  return [...new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0))];
}

/** Fire-and-forget: tell listed technicians to refresh their job list (RLS-safe refetch). */
export function broadcastTechnicianJobListRefresh(
  technicianIds: (string | null | undefined)[]
): void {
  const ids = uniqueTechnicianIds(technicianIds);
  if (ids.length === 0) return;

  const channel = supabase.channel(TECHNICIAN_JOB_LIST_BROADCAST_CHANNEL, {
    config: { broadcast: { ack: false, self: false } },
  });

  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      void channel.send({
        type: 'broadcast',
        event: TECHNICIAN_JOB_LIST_BROADCAST_EVENT,
        payload: { technicianIds: ids, at: Date.now() },
      });
      window.setTimeout(() => {
        void supabase.removeChannel(channel);
      }, 400);
    }
  });
}

export type TechnicianJobListRefreshPayload = {
  technicianIds?: string[];
  at?: number;
};
