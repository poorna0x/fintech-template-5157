import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { toast } from 'sonner';
import { broadcastTechnicianJobListRefresh } from '@/lib/technicianJobListSync';
import { db } from '@/lib/supabase';
import type { Job, Technician } from '@/types';

export type AdminCompleteFlowSnapshot = {
  jobId: string;
  assignedTechnicianId: string | null;
  status: string;
  assignedDate: string | null;
};

export function snapshotAdminCompleteJobAssignment(
  job: Job,
  snapshotRef: MutableRefObject<AdminCompleteFlowSnapshot | null>
) {
  const assignedTechnicianId =
    (job as any).assigned_technician_id ?? job.assignedTechnicianId ?? null;
  snapshotRef.current = {
    jobId: job.id,
    assignedTechnicianId: assignedTechnicianId ? String(assignedTechnicianId) : null,
    status: job.status,
    assignedDate: (job as any).assigned_date ?? job.assignedDate ?? null,
  };
}

export function clearAdminCompleteJobSnapshot(
  snapshotRef: MutableRefObject<AdminCompleteFlowSnapshot | null>
) {
  snapshotRef.current = null;
}

export async function fetchAdminJobForComplete(job: Job): Promise<Job> {
  if (job.customer && job.serviceType) {
    return job;
  }

  try {
    const { data: fullJob, error } = await db.jobs.getByIdFull(job.id);
    if (!error && fullJob) {
      return fullJob as Job;
    }
  } catch (error) {
    console.error('Error fetching job details:', error);
  }

  return job;
}

export async function revertIncompleteAdminCompleteFlow(ctx: {
  snapshotRef: MutableRefObject<AdminCompleteFlowSnapshot | null>;
  setJobs: Dispatch<SetStateAction<Job[]>>;
  setCustomerJobs: Dispatch<SetStateAction<Record<string, Job[]>>>;
}) {
  const snapshot = ctx.snapshotRef.current;
  if (!snapshot) return;
  ctx.snapshotRef.current = null;

  const applyLocalRevert = () => {
    ctx.setJobs((prev) =>
      prev.map((job) =>
        job.id === snapshot.jobId
          ? {
              ...job,
              assigned_technician_id: snapshot.assignedTechnicianId,
              assignedTechnicianId: snapshot.assignedTechnicianId,
              assigned_date: snapshot.assignedDate,
              assignedDate: snapshot.assignedDate,
              status: snapshot.status as Job['status'],
            }
          : job
      )
    );
    ctx.setCustomerJobs((prev) => {
      const updated = { ...prev };
      Object.keys(updated).forEach((customerId) => {
        updated[customerId] = updated[customerId].map((job) =>
          job.id === snapshot.jobId
            ? {
                ...job,
                assigned_technician_id: snapshot.assignedTechnicianId,
                assignedTechnicianId: snapshot.assignedTechnicianId,
                assigned_date: snapshot.assignedDate,
                assignedDate: snapshot.assignedDate,
                status: snapshot.status as Job['status'],
              }
            : job
        );
      });
      return updated;
    });
  };

  applyLocalRevert();

  try {
    const { data, error } = await db.jobs.getById(snapshot.jobId);
    if (error || !data) return;

    const row = data as Record<string, unknown>;
    const status = String(row.status || '');
    if (status === 'COMPLETED') return;

    const currentAssign = row.assigned_technician_id ? String(row.assigned_technician_id) : null;
    if (currentAssign === snapshot.assignedTechnicianId) return;

    const { error: updateError } = await db.jobs.update(snapshot.jobId, {
      assigned_technician_id: snapshot.assignedTechnicianId,
      assigned_date: snapshot.assignedDate,
      status: snapshot.status,
    });
    if (updateError) {
      console.warn(
        '[AdminDashboard] Could not revert assignment after cancelled complete flow:',
        updateError
      );
      return;
    }

    const techIds = [currentAssign, snapshot.assignedTechnicianId].filter(Boolean) as string[];
    if (techIds.length) broadcastTechnicianJobListRefresh(techIds);
  } catch (err) {
    console.warn('[AdminDashboard] Revert complete-flow assignment failed:', err);
  }
}

export function validateAdminCompleteTechnicianSelection(
  selectedTechnicianForComplete: string,
  selectedJobForComplete: Job | null,
  technicians: Technician[]
): boolean {
  if (!selectedTechnicianForComplete || !selectedJobForComplete) {
    toast.error('Please select who completed the job');
    return false;
  }

  if (selectedTechnicianForComplete === 'office') {
    return true;
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(selectedTechnicianForComplete)) {
    console.error('Invalid technician ID format:', selectedTechnicianForComplete);
    toast.error('Invalid technician selected. Please try again.');
    return false;
  }

  const selectedTechnician = technicians.find((t) => t.id === selectedTechnicianForComplete);
  if (!selectedTechnician) {
    console.error('Technician not found in list:', selectedTechnicianForComplete);
    toast.error('Selected technician not found. Please refresh and try again.');
    return false;
  }

  return true;
}
