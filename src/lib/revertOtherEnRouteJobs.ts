import { supabase } from '@/lib/supabase';

function assignedTechId(job: {
  assigned_technician_id?: string | null;
  assignedTechnicianId?: string | null;
}): string {
  return String(job.assigned_technician_id || job.assignedTechnicianId || '').trim();
}

/** Put other EN_ROUTE jobs for this technician back to ASSIGNED (normal Start Job). */
export function applyOtherEnRouteResetLocal<
  T extends {
    id: string;
    status?: string;
    assigned_technician_id?: string | null;
    assignedTechnicianId?: string | null;
  },
>(jobs: T[], technicianId: string, exceptJobId: string, exceptStatus?: string): T[] {
  const tech = String(technicianId || '').trim();
  const except = String(exceptJobId || '').trim();
  if (!tech || !except) {
    return exceptStatus
      ? jobs.map((j) => (j.id === except ? { ...j, status: exceptStatus } : j))
      : jobs;
  }

  return jobs.map((j) => {
    if (j.id === except) {
      return exceptStatus ? { ...j, status: exceptStatus } : j;
    }
    if (assignedTechId(j) !== tech) return j;
    if (String(j.status || '').toUpperCase() !== 'EN_ROUTE') return j;
    return { ...j, status: 'ASSIGNED' };
  });
}

export async function revertOtherEnRouteJobsToAssigned(opts: {
  technicianId: string | null | undefined;
  exceptJobId: string;
}): Promise<number> {
  const technicianId = String(opts.technicianId || '').trim();
  const exceptJobId = String(opts.exceptJobId || '').trim();
  if (!technicianId || !exceptJobId) return 0;

  const { data: rows, error: selectError } = await supabase
    .from('jobs')
    .select('id')
    .eq('assigned_technician_id', technicianId)
    .eq('status', 'EN_ROUTE')
    .neq('id', exceptJobId);

  if (selectError) {
    console.warn('[revertOtherEnRouteJobs]', selectError.message);
    return 0;
  }

  const ids = (rows || []).map((r) => String(r.id)).filter(Boolean);
  if (ids.length === 0) return 0;

  const { error } = await supabase
    .from('jobs')
    .update({ status: 'ASSIGNED', updated_at: new Date().toISOString() })
    .in('id', ids)
    .eq('status', 'EN_ROUTE');

  if (error) {
    console.warn('[revertOtherEnRouteJobs]', error.message);
    return 0;
  }
  return ids.length;
}
