import React from 'react';
import { XCircle } from 'lucide-react';
import { Job } from '@/types';

interface DeniedJobSectionProps {
  job: Job;
  denialReason: string;
  deniedBy: string;
  formattedDeniedAt: string | null;
}

export const DeniedJobSection: React.FC<DeniedJobSectionProps> = ({
  job,
  denialReason,
  deniedBy,
  formattedDeniedAt,
}) => {
  if (job.status !== 'DENIED' || (!denialReason && !deniedBy && !formattedDeniedAt)) {
    return null;
  }

  return (
    <div className="mt-4 mb-2">
      <div className="flex items-start gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2">
        <XCircle className="w-4 h-4 text-red-600 mt-0.5" />
        <div className="space-y-1 text-sm text-gray-900">
          <div className="font-semibold text-red-900">
            Job Denied
          </div>
          {deniedBy && (
            <div className="text-gray-700">
              <span className="text-gray-500">Denied by:</span> {deniedBy}
            </div>
          )}
          {denialReason && (
            <div className="text-gray-700">
              <span className="text-gray-500">Reason:</span> {denialReason}
            </div>
          )}
          {formattedDeniedAt && (
            <div className="text-xs text-gray-500">
              Denied on {formattedDeniedAt}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

