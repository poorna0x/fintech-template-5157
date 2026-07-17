import type { Dispatch, SetStateAction } from 'react';
import { toast } from 'sonner';
import type { AdminStatusFilter } from '@/lib/adminDashboardCache';
import type { LoadFilteredJobsFn } from '@/lib/adminLoadDashboardData';
import { createJobAssignedNotification, sendNotification } from '@/lib/notifications';
import { broadcastTechnicianJobListRefresh } from '@/lib/technicianJobListSync';
import {
  notifyTechnicianJobPush,
  teamMemberAddedPushText,
  teamMemberRemovedPushText,
} from '@/lib/adminTechPushNotify';
import { db } from '@/lib/supabase';
import type { Job, Technician } from '@/types';

function getJobTeamMemberIds(job: Job): string[] {
  const raw = (job as any).team_members;
  return Array.isArray(raw) ? raw : [];
}

export async function saveAdminTeamMember(
  ctx: {
    jobForTeam: Job | null;
    selectedTeamMemberId: string;
    technicians: Technician[];
    statusFilter: AdminStatusFilter;
    currentPage: number;
    setAddTeamDialogOpen: Dispatch<SetStateAction<boolean>>;
    setJobForTeam: Dispatch<SetStateAction<Job | null>>;
    setSelectedTeamMemberId: Dispatch<SetStateAction<string>>;
    loadFilteredJobs: LoadFilteredJobsFn;
  }
) {
  if (!ctx.jobForTeam || !ctx.selectedTeamMemberId) return;

  try {
    const teamMembersArray = getJobTeamMemberIds(ctx.jobForTeam);

    if (teamMembersArray.includes(ctx.selectedTeamMemberId)) {
      toast.error('This technician is already in the team');
      return;
    }

    if ((ctx.jobForTeam as any).assigned_technician_id === ctx.selectedTeamMemberId) {
      toast.error('This technician is already the primary assigned technician');
      return;
    }

    const updatedTeamMembers = [...teamMembersArray, ctx.selectedTeamMemberId];

    const { error } = await db.jobs.update(ctx.jobForTeam.id, {
      team_members: updatedTeamMembers,
    } as any);

    if (error) throw error;

    broadcastTechnicianJobListRefresh([ctx.selectedTeamMemberId]);

    const teamMember = ctx.technicians.find((t) => t.id === ctx.selectedTeamMemberId);
    if (teamMember) {
      const notification = createJobAssignedNotification(
        (ctx.jobForTeam as any).job_number || ctx.jobForTeam.jobNumber || 'Job',
        (ctx.jobForTeam.customer as any)?.full_name ||
          (ctx.jobForTeam.customer as any)?.fullName ||
          'Customer',
        teamMember.fullName,
        ctx.jobForTeam.id,
        teamMember.id
      );
      await sendNotification(notification);
    }

    // App push to the helper (primary assignee already got assign/reassign pushes).
    notifyTechnicianJobPush({
      technicianId: ctx.selectedTeamMemberId,
      ...teamMemberAddedPushText({ job: ctx.jobForTeam as any }),
    });

    toast.success('Team member added successfully');
    ctx.setAddTeamDialogOpen(false);
    ctx.setJobForTeam(null);
    ctx.setSelectedTeamMemberId('');

    await ctx.loadFilteredJobs(ctx.statusFilter, ctx.currentPage, { silent: true });
  } catch (error: any) {
    console.error('Error adding team member:', error);
    toast.error(error.message || 'Failed to add team member');
  }
}

export async function removeAdminTeamMember(
  ctx: {
    jobForRemoveTeam: Job | null;
    selectedTeamMemberToRemove: string;
    statusFilter: AdminStatusFilter;
    currentPage: number;
    setRemoveTeamDialogOpen: Dispatch<SetStateAction<boolean>>;
    setJobForRemoveTeam: Dispatch<SetStateAction<Job | null>>;
    setSelectedTeamMemberToRemove: Dispatch<SetStateAction<string>>;
    loadFilteredJobs: LoadFilteredJobsFn;
  }
) {
  if (!ctx.jobForRemoveTeam || !ctx.selectedTeamMemberToRemove) return;

  try {
    const teamMembersArray = getJobTeamMemberIds(ctx.jobForRemoveTeam);
    const updatedTeamMembers = teamMembersArray.filter(
      (id: string) => id !== ctx.selectedTeamMemberToRemove
    );

    const { error } = await db.jobs.update(ctx.jobForRemoveTeam.id, {
      team_members: updatedTeamMembers,
    } as any);

    if (error) throw error;

    broadcastTechnicianJobListRefresh([ctx.selectedTeamMemberToRemove]);

    notifyTechnicianJobPush({
      technicianId: ctx.selectedTeamMemberToRemove,
      ...teamMemberRemovedPushText({ job: ctx.jobForRemoveTeam as any }),
    });

    toast.success('Team member removed successfully');
    ctx.setRemoveTeamDialogOpen(false);
    ctx.setJobForRemoveTeam(null);
    ctx.setSelectedTeamMemberToRemove('');

    await ctx.loadFilteredJobs(ctx.statusFilter, ctx.currentPage, { silent: true });
  } catch (error: any) {
    console.error('Error removing team member:', error);
    toast.error(error.message || 'Failed to remove team member');
  }
}
