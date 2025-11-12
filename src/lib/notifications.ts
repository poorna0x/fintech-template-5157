import { toast } from 'sonner';

// Notification types
export type NotificationType = 'job_assigned' | 'job_completed' | 'job_cancelled' | 'technician_offline' | 'job_assignment_request' | 'job_assignment_accepted' | 'job_assignment_rejected';

export interface NotificationData {
  type: NotificationType;
  title: string;
  message: string;
  jobId?: string;
  technicianId?: string;
  customerName?: string;
  jobNumber?: string;
  requestId?: string; // For assignment requests
  timestamp: Date;
}

// Browser notifications disabled - only using toast notifications
// Removed requestNotificationPermission and showBrowserNotification functions

// Show toast notification
export const showToastNotification = (data: NotificationData): void => {
  const getToastConfig = () => {
    switch (data.type) {
      case 'job_assigned':
        return {
          type: 'success' as const,
          title: 'New Job Assigned!',
          description: data.message
        };
      case 'job_completed':
        return {
          type: 'success' as const,
          title: 'Job Completed!',
          description: data.message
        };
      case 'job_cancelled':
        return {
          type: 'error' as const,
          title: 'Job Cancelled',
          description: data.message
        };
      case 'technician_offline':
        return {
          type: 'warning' as const,
          title: 'Technician Offline',
          description: data.message
        };
      case 'job_assignment_request':
        return {
          type: 'info' as const,
          title: 'New Job Assignment Request',
          description: data.message
        };
      case 'job_assignment_accepted':
        return {
          type: 'success' as const,
          title: 'Job Assignment Accepted',
          description: data.message
        };
      case 'job_assignment_rejected':
        return {
          type: 'warning' as const,
          title: 'Job Assignment Rejected',
          description: data.message
        };
      default:
        return {
          type: 'info' as const,
          title: data.title,
          description: data.message
        };
    }
  };

  const config = getToastConfig();
  
  if (config.type === 'success') {
    toast.success(config.title, { description: config.description });
  } else if (config.type === 'error') {
    toast.error(config.title, { description: config.description });
  } else if (config.type === 'warning') {
    toast.warning(config.title, { description: config.description });
  } else {
    toast.info(config.title, { description: config.description });
  }
};

// Main notification function
export const sendNotification = async (data: NotificationData): Promise<void> => {
  // Only show toast notification (browser notifications disabled)
  showToastNotification(data);
};

// Specific notification creators
export const createJobAssignedNotification = (
  jobNumber: string,
  customerName: string,
  technicianName: string,
  jobId: string,
  technicianId: string
): NotificationData => ({
  type: 'job_assigned',
  title: 'New Job Assigned',
  message: `Job #${jobNumber} assigned to ${technicianName} for ${customerName}`,
  jobId,
  technicianId,
  customerName,
  jobNumber,
  timestamp: new Date()
});

export const createJobCompletedNotification = (
  jobNumber: string,
  customerName: string,
  technicianName: string,
  jobId: string
): NotificationData => ({
  type: 'job_completed',
  title: 'Job Completed',
  message: `Job #${jobNumber} completed by ${technicianName} for ${customerName}`,
  jobId,
  customerName,
  jobNumber,
  timestamp: new Date()
});

export const createJobCancelledNotification = (
  jobNumber: string,
  customerName: string,
  jobId: string
): NotificationData => ({
  type: 'job_cancelled',
  title: 'Job Cancelled',
  message: `Job #${jobNumber} for ${customerName} has been cancelled`,
  jobId,
  customerName,
  jobNumber,
  timestamp: new Date()
});

export const createTechnicianOfflineNotification = (
  technicianName: string,
  technicianId: string
): NotificationData => ({
  type: 'technician_offline',
  title: 'Technician Offline',
  message: `${technicianName} has gone offline`,
  technicianId,
  timestamp: new Date()
});

// Job Assignment Request Notifications
export const createJobAssignmentRequestNotification = (
  jobNumber: string,
  customerName: string,
  technicianName: string,
  jobId: string,
  technicianId: string,
  requestId: string
): NotificationData => ({
  type: 'job_assignment_request',
  title: 'New Job Assignment Request',
  message: `Job #${jobNumber} assignment request for ${customerName}`,
  jobId,
  technicianId,
  customerName,
  jobNumber,
  requestId,
  timestamp: new Date()
});

export const createJobAssignmentAcceptedNotification = (
  jobNumber: string,
  customerName: string,
  technicianName: string,
  jobId: string
): NotificationData => ({
  type: 'job_assignment_accepted',
  title: 'Job Assignment Accepted',
  message: `${technicianName} accepted Job #${jobNumber} for ${customerName}`,
  jobId,
  customerName,
  jobNumber,
  timestamp: new Date()
});

export const createJobAssignmentRejectedNotification = (
  jobNumber: string,
  customerName: string,
  technicianName: string,
  jobId: string
): NotificationData => ({
  type: 'job_assignment_rejected',
  title: 'Job Assignment Rejected',
  message: `${technicianName} rejected Job #${jobNumber} for ${customerName}`,
  jobId,
  customerName,
  jobNumber,
  timestamp: new Date()
});

// Notification storage for offline viewing
export const storeNotification = (data: NotificationData): void => {
  const notifications = getStoredNotifications();
  notifications.unshift(data);
  
  // Keep only last 50 notifications
  if (notifications.length > 50) {
    notifications.splice(50);
  }
  
  localStorage.setItem('job_notifications', JSON.stringify(notifications));
};

export const getStoredNotifications = (): NotificationData[] => {
  try {
    const stored = localStorage.getItem('job_notifications');
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

export const clearStoredNotifications = (): void => {
  localStorage.removeItem('job_notifications');
};
