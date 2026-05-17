import { supabase, db } from '@/lib/supabase';

async function clearTechnicianJobReferences(technicianId: string) {
  await supabase.from('jobs').update({ assigned_technician_id: null }).eq('assigned_technician_id', technicianId);
  await supabase.from('jobs').update({ assigned_by: null }).eq('assigned_by', technicianId);
  await supabase.from('jobs').update({ completed_by: null }).eq('completed_by', technicianId);

  const { data: teamJobs } = await supabase
    .from('jobs')
    .select('id, team_members')
    .contains('team_members', [technicianId]);

  for (const job of teamJobs || []) {
    if (!Array.isArray(job.team_members) || !job.team_members.includes(technicianId)) continue;
    const team = job.team_members.filter((id: string) => id !== technicianId);
    await supabase
      .from('jobs')
      .update({ team_members: team.length > 0 ? team : null })
      .eq('id', job.id);
  }

  await supabase
    .from('amc_contracts')
    .update({ given_by_technician_id: null })
    .eq('given_by_technician_id', technicianId);

  await supabase.from('messages').delete().eq('recipient_technician_id', technicianId);
}

async function deleteTechnicianViaSupabase(technicianId: string): Promise<{ authSyncSkipped: boolean }> {
  await clearTechnicianJobReferences(technicianId);
  const { error } = await db.technicians.delete(technicianId);
  if (error) throw new Error(error.message || 'Failed to delete technician');
  return { authSyncSkipped: true };
}

async function callDeleteFunction(
  technicianId: string,
  accessToken: string,
  options?: { authOnly?: boolean }
): Promise<void> {
  const res = await fetch('/.netlify/functions/delete-technician-and-data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      technicianId,
      accessToken,
      confirmed: true,
      authOnly: options?.authOnly ?? false,
    }),
  });

  const result = (await res.json().catch(() => ({}))) as { error?: string };

  if (res.status === 404 && result.error === 'Not found') {
    throw new Error('FUNCTION_NOT_REGISTERED');
  }

  if (!res.ok) {
    throw new Error(result.error || `Delete failed (${res.status})`);
  }
}

/** Delete technician row + related data. Uses Netlify when available; falls back to Supabase client. */
export async function deleteTechnicianCompletely(technicianId: string): Promise<{
  authSyncSkipped: boolean;
}> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) {
    throw new Error('Admin session required. Please log in again.');
  }

  try {
    await callDeleteFunction(technicianId, accessToken);
    return { authSyncSkipped: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message !== 'FUNCTION_NOT_REGISTERED' && !message.includes('Failed to fetch')) {
      throw err;
    }
  }

  await deleteTechnicianViaSupabase(technicianId);

  try {
    await callDeleteFunction(technicianId, accessToken, { authOnly: true });
    return { authSyncSkipped: false };
  } catch {
    return { authSyncSkipped: true };
  }
}
