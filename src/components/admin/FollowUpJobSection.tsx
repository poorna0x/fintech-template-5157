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
      <div className="flex items-start gap-2 sm:gap-3 rounded-md border border-gray-200 px-2 py-2 sm:px-3">
        <CalendarPlus className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" />
        <div className="space-y-1 text-xs sm:text-sm text-gray-900 flex-1 min-w-0">
          <div className="font-semibold break-words">
            <span className="hidden sm:inline">Follow-up scheduled for </span>
            <span className="sm:hidden">Follow-up: </span>
            <span className="text-indigo-600">{formattedFollowUpDate || 'Date not set'}</span>
            {formattedFollowUpTime && (
              <span className="text-gray-600">
                <span className="hidden sm:inline"> at </span>
                <span className="sm:hidden"> - </span>
                {formattedFollowUpTime}
              </span>
            )}
          </div>
          <div className="text-gray-700 break-words">
            <span className="text-gray-500">Reason:</span> {followUpNotes || 'Not confirmed'}
          </div>
          <div className="text-xs text-gray-500 break-words">
            Scheduled by {followUpScheduledByName}
            {formattedFollowUpScheduledAt && (
              <span className="hidden sm:inline"> on {formattedFollowUpScheduledAt}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

