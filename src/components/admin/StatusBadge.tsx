import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Clock, Wrench, CheckCircle, AlertCircle, CalendarPlus, XCircle } from 'lucide-react';

export const StatusBadge = ({ status }: { status: string }) => {
  const statusConfig = {
    'PENDING': { color: 'bg-yellow-100 text-yellow-800', icon: Clock },
    'ASSIGNED': { color: 'bg-blue-100 text-blue-800', icon: Wrench },
    'IN_PROGRESS': { color: 'bg-orange-100 text-orange-800', icon: Wrench },
    'COMPLETED': { color: 'bg-green-100 text-green-800', icon: CheckCircle },
    'CANCELLED': { color: 'bg-red-100 text-red-800', icon: AlertCircle },
    'FOLLOW_UP': { color: 'bg-indigo-100 text-indigo-800', icon: CalendarPlus },
    'DENIED': { color: 'bg-red-100 text-red-800', icon: XCircle },
    'ACTIVE': { color: 'bg-green-100 text-green-800', icon: CheckCircle },
    'INACTIVE': { color: 'bg-gray-100 text-gray-800', icon: AlertCircle },
  };

  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig['PENDING'];
  const Icon = config.icon;

  return (
    <Badge className={`${config.color} border-0`}>
      <Icon className="w-3 h-3 mr-1" />
      {status}
    </Badge>
  );
};

