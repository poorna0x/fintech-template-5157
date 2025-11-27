import React from 'react';
import { Card } from '@/components/ui/card';
import { Wrench, CalendarPlus, XCircle, CheckCircle } from 'lucide-react';
import { Job } from '@/types';

interface StatsCardsProps {
  statusFilter: string;
  onFilterChange: (filter: string) => void;
  jobCounts: {
    ongoing: number;
    followup: number;
    denied: number;
    completed: number;
  };
  pendingJobs: Job[];
  inProgressJobs: Job[];
}

export const StatsCards: React.FC<StatsCardsProps> = ({
  statusFilter,
  onFilterChange,
  jobCounts,
  pendingJobs,
  inProgressJobs,
}) => {
  return (
    <div className="grid grid-cols-2 gap-3 mb-6 sm:grid-cols-4 sm:gap-6">
      <Card 
        className={`border-2 p-3 sm:p-6 cursor-pointer transition-all hover:shadow-md ${
          statusFilter === 'ONGOING' 
            ? 'bg-blue-50 border-blue-500 shadow-md' 
            : 'bg-white border-gray-200 hover:border-gray-300'
        }`}
        onClick={() => onFilterChange('ONGOING')}
      >
        <div className="flex items-center justify-between mb-2">
          <Wrench className={`h-5 w-5 sm:h-4 sm:w-4 ${statusFilter === 'ONGOING' ? 'text-blue-600' : 'text-blue-600'}`} />
          <div className="text-right">
            <div className={`text-lg font-bold sm:text-2xl ${statusFilter === 'ONGOING' ? 'text-blue-900' : 'text-gray-900'}`}>
              {jobCounts.ongoing}
            </div>
            <p className="text-xs text-gray-500">Ongoing</p>
          </div>
        </div>
        <p className="text-xs text-gray-500">
            {pendingJobs.length} pending, {inProgressJobs.length} in progress
          </p>
      </Card>

      <Card 
        className={`border-2 p-3 sm:p-6 cursor-pointer transition-all hover:shadow-md ${
          statusFilter === 'RESCHEDULED' 
            ? 'bg-indigo-50 border-indigo-500 shadow-md' 
            : 'bg-white border-gray-200 hover:border-gray-300'
        }`}
        onClick={() => onFilterChange('RESCHEDULED')}
      >
        <div className="flex items-center justify-between mb-2">
          <CalendarPlus className={`h-5 w-5 sm:h-4 sm:w-4 ${statusFilter === 'RESCHEDULED' ? 'text-indigo-600' : 'text-indigo-600'}`} />
          <div className="text-right">
            <div className={`text-lg font-bold sm:text-2xl ${statusFilter === 'RESCHEDULED' ? 'text-indigo-900' : 'text-gray-900'}`}>
              {jobCounts.followup}
            </div>
            <p className="text-xs text-gray-500">Followup</p>
          </div>
        </div>
        <p className="text-xs text-gray-500">
            Jobs requiring follow-up
          </p>
      </Card>

      <Card 
        className={`border-2 p-3 sm:p-6 cursor-pointer transition-all hover:shadow-md ${
          statusFilter === 'CANCELLED' 
            ? 'bg-red-50 border-red-500 shadow-md' 
            : 'bg-white border-gray-200 hover:border-gray-300'
        }`}
        onClick={() => onFilterChange('CANCELLED')}
      >
        <div className="flex items-center justify-between mb-2">
          <XCircle className={`h-5 w-5 sm:h-4 sm:w-4 ${statusFilter === 'CANCELLED' ? 'text-red-600' : 'text-red-600'}`} />
          <div className="text-right">
            <div className={`text-lg font-bold sm:text-2xl ${statusFilter === 'CANCELLED' ? 'text-red-900' : 'text-gray-900'}`}>
              {jobCounts.denied}
            </div>
            <p className="text-xs text-gray-500">Denied</p>
          </div>
        </div>
        <p className="text-xs text-gray-500">
            Cancelled or denied jobs
          </p>
      </Card>

      <Card 
        className={`border-2 p-3 sm:p-6 cursor-pointer transition-all hover:shadow-md ${
          statusFilter === 'COMPLETED' 
            ? 'bg-green-50 border-green-500 shadow-md' 
            : 'bg-white border-gray-200 hover:border-gray-300'
        }`}
        onClick={() => onFilterChange('COMPLETED')}
      >
        <div className="flex items-center justify-between mb-2">
          <CheckCircle className={`h-5 w-5 sm:h-4 sm:w-4 ${statusFilter === 'COMPLETED' ? 'text-green-600' : 'text-green-600'}`} />
          <div className="text-right">
            <div className={`text-lg font-bold sm:text-2xl ${statusFilter === 'COMPLETED' ? 'text-green-900' : 'text-gray-900'}`}>
              {jobCounts.completed}
            </div>
            <p className="text-xs text-gray-500">Completed</p>
          </div>
        </div>
        <p className="text-xs text-gray-500">
            Successfully completed jobs
          </p>
      </Card>
    </div>
  );
};

