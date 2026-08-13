import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { toast } from 'sonner';
import type { AdminStatusFilter } from '@/lib/adminDashboardCache';
import type { LoadFilteredJobsFn } from '@/lib/adminLoadDashboardData';
import { parseRequirements } from '@/lib/followUpToOngoing';
import { db } from '@/lib/supabase';
import type { Job } from '@/types';

type RequirementFlag = 'mail_sent' | 'message_sent';
type RequirementFlagAt = 'mail_sent_at' | 'message_sent_at';

function upsertRequirementSentFlag(
  rawRequirements: unknown,
  flag: RequirementFlag,
  atFlag: RequirementFlagAt
): Record<string, unknown>[] {
  const requirements = parseRequirements(rawRequirements);
  const sentAt = new Date().toISOString();
  const flagIndex = requirements.findIndex((r) => r?.[flag] !== undefined);

  if (flagIndex >= 0) {
    requirements[flagIndex] = {
      ...requirements[flagIndex],
      [flag]: true,
      [atFlag]: sentAt,
    };
    return requirements;
  }

  for (let i = 0; i < requirements.length; i++) {
    const entry = requirements[i];
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      requirements[i] = { ...entry, [flag]: true, [atFlag]: sentAt };
      return requirements;
    }
  }

  return [...requirements, { [flag]: true, [atFlag]: sentAt }];
}

async function persistJobRequirementsFlag(
  jobId: string,
  jobs: Job[],
  flag: RequirementFlag,
  atFlag: RequirementFlagAt
) {
  const job = jobs.find((j) => j.id === jobId);
  if (!job) return null;

  const requirements = upsertRequirementSentFlag(
    (job as any).requirements || job.requirements,
    flag,
    atFlag
  );

  const { error } = await db.jobs.update(jobId, {
    requirements: JSON.stringify(requirements),
  } as any);

  return { error, requirements };
}

export async function markAdminJobMailSent(
  jobId: string,
  ctx: {
    jobs: Job[];
    statusFilter: AdminStatusFilter;
    currentPage: number;
    loadCompletedJobDetails: (jobId: string) => Promise<void>;
    loadFilteredJobs: LoadFilteredJobsFn;
    jobIdsSkipCompletionSoundRef?: MutableRefObject<Set<string>>;
  }
) {
  try {
    ctx.jobIdsSkipCompletionSoundRef?.current.add(jobId);
    const result = await persistJobRequirementsFlag(jobId, ctx.jobs, 'mail_sent', 'mail_sent_at');
    if (!result) return;

    if (result.error) {
      console.error('Error marking mail as sent:', result.error);
      toast.error('Failed to save mail status: ' + result.error.message);
      return;
    }

    await ctx.loadCompletedJobDetails(jobId);
    await ctx.loadFilteredJobs(ctx.statusFilter, ctx.currentPage);
  } catch (error: any) {
    console.error('Error marking mail as sent:', error);
  }
}

export async function markAdminJobMessageSent(
  jobId: string,
  ctx: {
    jobs: Job[];
    statusFilter: AdminStatusFilter;
    currentPage: number;
    loadCompletedJobDetails: (jobId: string) => Promise<void>;
    loadFilteredJobs: LoadFilteredJobsFn;
    closeAdminModal: () => void;
    setSelectedJobForMessage: Dispatch<SetStateAction<Job | null>>;
    jobIdsSkipCompletionSoundRef?: MutableRefObject<Set<string>>;
  }
) {
  try {
    ctx.jobIdsSkipCompletionSoundRef?.current.add(jobId);
    const result = await persistJobRequirementsFlag(
      jobId,
      ctx.jobs,
      'message_sent',
      'message_sent_at'
    );
    if (!result) return;

    if (result.error) {
      console.error('Error marking message as sent:', result.error);
      toast.error('Failed to save message status: ' + result.error.message);
      return;
    }

    console.log(
      'Updated requirements with message_sent:',
      JSON.stringify(result.requirements, null, 2)
    );

    toast.success('Message sent status updated');
    ctx.closeAdminModal();
    ctx.setSelectedJobForMessage(null);
    await ctx.loadCompletedJobDetails(jobId);
    await ctx.loadFilteredJobs(ctx.statusFilter, ctx.currentPage);
  } catch (error: any) {
    console.error('Error marking message as sent:', error);
  }
}
