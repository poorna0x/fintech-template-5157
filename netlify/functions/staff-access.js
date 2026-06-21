// Shared staff access checks for Netlify functions (service-role queries).

function teamMembersInclude(teamMembers, technicianId) {
  if (!Array.isArray(teamMembers) || !technicianId) return false;
  const id = String(technicianId);
  return teamMembers.some((m) => String(m) === id);
}

async function technicianCanAccessJob(admin, technicianId, jobId) {
  if (!technicianId || !jobId) return false;

  const { data: job, error } = await admin
    .from('jobs')
    .select('id, assigned_technician_id, assigned_by, completed_by, team_members')
    .eq('id', jobId)
    .maybeSingle();

  if (error || !job) return false;

  if (job.assigned_technician_id === technicianId) return true;
  if (job.assigned_by === technicianId) return true;
  if (job.completed_by === technicianId) return true;
  if (teamMembersInclude(job.team_members, technicianId)) return true;

  const { data: requestRow } = await admin
    .from('job_assignment_requests')
    .select('id')
    .eq('job_id', jobId)
    .eq('technician_id', technicianId)
    .maybeSingle();

  return Boolean(requestRow);
}

async function technicianCanAccessCustomer(admin, technicianId, customerId) {
  if (!technicianId || !customerId) return false;

  const { data: jobs, error } = await admin
    .from('jobs')
    .select('id, assigned_technician_id, team_members')
    .eq('customer_id', customerId)
    .limit(100);

  if (error || !jobs?.length) return false;

  for (const job of jobs) {
    if (job.assigned_technician_id === technicianId) return true;
    if (teamMembersInclude(job.team_members, technicianId)) return true;
  }

  const jobIds = jobs.map((j) => j.id).filter(Boolean);
  if (!jobIds.length) return false;

  const { data: requestRow } = await admin
    .from('job_assignment_requests')
    .select('id')
    .in('job_id', jobIds)
    .eq('technician_id', technicianId)
    .limit(1)
    .maybeSingle();

  return Boolean(requestRow);
}

/** Technician may save AMC only for customers on their assigned jobs. */
async function verifyTechnicianAmcSaveAccess(admin, technicianId, { customerId, jobId }) {
  if (!technicianId || !customerId) {
    return { ok: false, error: 'Forbidden' };
  }

  if (jobId) {
    const canAccessJob = await technicianCanAccessJob(admin, technicianId, jobId);
    if (!canAccessJob) {
      return { ok: false, error: 'Forbidden: job not assigned to you' };
    }

    const { data: job, error } = await admin
      .from('jobs')
      .select('customer_id')
      .eq('id', jobId)
      .maybeSingle();

    if (error || !job) {
      return { ok: false, error: 'Forbidden: job not found' };
    }
    if (job.customer_id !== customerId) {
      return { ok: false, error: 'Forbidden: customer does not match job' };
    }

    return { ok: true };
  }

  const canAccessCustomer = await technicianCanAccessCustomer(admin, technicianId, customerId);
  if (!canAccessCustomer) {
    return { ok: false, error: 'Forbidden: customer not on your assigned jobs' };
  }

  return { ok: true };
}

module.exports = {
  technicianCanAccessJob,
  technicianCanAccessCustomer,
  verifyTechnicianAmcSaveAccess,
};
