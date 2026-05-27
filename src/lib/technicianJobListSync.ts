// Use the lightweight auth/realtime client (supabaseClient) — this module only needs
// Realtime channels, never the `db` helper. Avoid dragging the admin-data chunk into
// any caller's static dep graph.
import { supabase } from './supabaseClient';

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

/** Collect technician UUIDs from a job row (assignee, completer, team). */
export function technicianIdsFromJob(job: {
  assigned_technician_id?: string | null;
  assignedTechnicianId?: string | null;
  completed_by?: string | null;
  completedBy?: string | null;
  team_members?: unknown;
}): string[] {
  const ids: string[] = [];
  const assigned =
    job.assigned_technician_id ?? job.assignedTechnicianId ?? null;
  const completed = job.completed_by ?? job.completedBy ?? null;
  if (assigned) ids.push(assigned);
  if (completed) ids.push(completed);
  const team = job.team_members;
  if (Array.isArray(team)) {
    for (const m of team) {
      if (typeof m === 'string' && m.length > 0) ids.push(m);
    }
  }
  return uniqueTechnicianIds(ids);
}

/** Notify technicians on this job to refresh their dashboard list (e.g. after admin completes). */
export function broadcastTechnicianJobListRefreshForJob(
  job: Parameters<typeof technicianIdsFromJob>[0]
): void {
  broadcastTechnicianJobListRefresh(technicianIdsFromJob(job));
}
