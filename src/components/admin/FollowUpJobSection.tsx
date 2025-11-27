import React from 'react';
import { CalendarPlus } from 'lucide-react';
import { Job } from '@/types';

interface FollowUpJobSectionProps {
  job: Job;
  formattedFollowUpDate: string | null;
  formattedFollowUpTime: string | null;
  followUpNotes: string;
  formattedFollowUpScheduledAt: string | null;
  followUpScheduledByName: string;
}

export const FollowUpJobSection: React.FC<FollowUpJobSectionProps> = ({
  job,
  formattedFollowUpDate,
  formattedFollowUpTime,
  followUpNotes,
  formattedFollowUpScheduledAt,
  followUpScheduledByName,
}) => {
  if (job.status !== 'FOLLOW_UP' || (!formattedFollowUpDate && !formattedFollowUpTime && !followUpNotes && !formattedFollowUpScheduledAt)) {
    return null;
  }

  return (
    <div className="mt-4 mb-2">
      <div className="flex items-start gap-3 rounded-md border border-gray-200 px-3 py-2">
        <CalendarPlus className="w-4 h-4 text-gray-500 mt-0.5" />
        <div className="space-y-1 text-sm text-gray-900">
          <div className="font-semibold">
            Follow-up scheduled for {formattedFollowUpDate || 'Date not set'}
            {formattedFollowUpTime ? ` at ${formattedFollowUpTime}` : ''}
          </div>
          <div className="text-gray-700">
            <span className="text-gray-500">Reason:</span> {followUpNotes || 'Not confirmed'}
          </div>
          <div className="text-xs text-gray-500">
            Scheduled by {followUpScheduledByName}
            {formattedFollowUpScheduledAt ? ` on ${formattedFollowUpScheduledAt}` : ''}
          </div>
        </div>
      </div>
    </div>
  );
};

