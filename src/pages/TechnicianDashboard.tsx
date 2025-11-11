import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { 
  Wrench, 
  Search, 
  Filter, 
  Clock, 
  MapPin, 
  Phone, 
  Mail, 
  Calendar,
  CheckCircle,
  Play,
  Pause,
  AlertCircle,
  LogOut,
  User,
  Eye,
  CalendarPlus,
  XCircle,
  Camera,
  MessageCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/supabase';
import { Job, JobAssignmentRequest } from '@/types';
import { sendNotification, createJobCompletedNotification, createJobAssignmentRequestNotification, createJobAssignmentAcceptedNotification, createJobAssignmentRejectedNotification } from '@/lib/notifications';
import FollowUpModal from '@/components/FollowUpModal';
import { registerTechnicianPWA } from '@/lib/pwa';

const TechnicianDashboard = () => {
  const { user, logout, isTechnician, loading } = useAuth();
  const navigate = useNavigate();
  
  const [jobs, setJobs] = useState<Job[]>([]);
  const [filteredJobs, setFilteredJobs] = useState<Job[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ONGOING' | 'PENDING' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'RESCHEDULED'>('ONGOING');
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [jobNotes, setJobNotes] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  // Job Assignment Requests state
  const [assignmentRequests, setAssignmentRequests] = useState<JobAssignmentRequest[]>([]);
  const [assignmentRequestsLoading, setAssignmentRequestsLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<JobAssignmentRequest | null>(null);
  const [responseNotes, setResponseNotes] = useState('');
  const [isResponding, setIsResponding] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<{lat: number, lng: number} | null>(null);
  const [distances, setDistances] = useState<{[jobId: string]: number}>({});

  // Follow-up functionality state
  const [followUpModalOpen, setFollowUpModalOpen] = useState(false);
  const [selectedJobForFollowUp, setSelectedJobForFollowUp] = useState<Job | null>(null);
  const [denyDialogOpen, setDenyDialogOpen] = useState(false);
  useEffect(() => {
    registerTechnicianPWA();
  }, []);

  const [selectedJobForDeny, setSelectedJobForDeny] = useState<Job | null>(null);
  const [denyReason, setDenyReason] = useState('');
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [selectedJobForComplete, setSelectedJobForComplete] = useState<Job | null>(null);
  const [completionNotes, setCompletionNotes] = useState('');

  // Phone popup state
  const [phonePopupOpen, setPhonePopupOpen] = useState(false);
  const [selectedCustomerPhone, setSelectedCustomerPhone] = useState<{phone: string, alternate_phone?: string, full_name?: string} | null>(null);

  // Location dialog state
  const [locationDialogOpen, setLocationDialogOpen] = useState<{[jobId: string]: boolean}>({});

  // Photos dialog state
  const [photosDialogOpen, setPhotosDialogOpen] = useState(false);
  const [selectedJobPhotos, setSelectedJobPhotos] = useState<{jobId: string, photos: string[]} | null>(null);

  // Redirect if not technician
  useEffect(() => {
    console.log('TechnicianDashboard: Checking auth status...', { isTechnician, user, loading, userRole: user?.role });
    
    // Only redirect if loading is complete and user is not a technician
    // Wait for loading to complete before checking auth status
    if (!loading) {
      // If no user or user is not a technician, redirect to login
      if (!user || user.role !== 'technician') {
        console.log('Not a technician, redirecting to login...', { user, isTechnician, userRole: user?.role });
        navigate('/technician/login', { replace: true });
      }
    }
  }, [isTechnician, navigate, user, loading]);

  // Load assigned jobs and assignment requests
  useEffect(() => {
    if (user?.technicianId) {
      loadAssignedJobs();
      loadAssignmentRequests();
      getCurrentLocation();
    }
  }, [user?.technicianId]);

  // Get current location
  const getCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const location = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          setCurrentLocation(location);
          console.log('Current location:', location);
        },
        (error) => {
          console.error('Error getting location:', error);
          toast.error('Unable to get your location. Distance calculations will not be available.');
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 300000 // 5 minutes
        }
      );
    } else {
      console.error('Geolocation not supported');
      toast.error('Location services not supported. Distance calculations will not be available.');
    }
  };

  // Calculate distance between two points using Haversine formula
  const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // Distance in kilometers
  };

  // Calculate distances for all jobs
  const calculateDistances = () => {
    if (!currentLocation) return;

    const newDistances: {[jobId: string]: number} = {};

    // Calculate distances for assigned jobs
    jobs.forEach(job => {
      const customerLocation = job.serviceLocation as any;
      if (customerLocation?.latitude && customerLocation?.longitude) {
        const distance = calculateDistance(
          currentLocation.lat,
          currentLocation.lng,
          customerLocation.latitude,
          customerLocation.longitude
        );
        newDistances[job.id] = Math.round(distance * 10) / 10; // Round to 1 decimal place
      }
    });

    // Calculate distances for assignment requests
    assignmentRequests.forEach(request => {
      const job = request.job as any;
      const customerLocation = job?.customer?.location;
      if (customerLocation?.latitude && customerLocation?.longitude) {
        const distance = calculateDistance(
          currentLocation.lat,
          currentLocation.lng,
          customerLocation.latitude,
          customerLocation.longitude
        );
        newDistances[job.id] = Math.round(distance * 10) / 10;
      }
    });

    setDistances(newDistances);
  };

  // Recalculate distances when location or jobs change
  useEffect(() => {
    if (currentLocation && (jobs.length > 0 || assignmentRequests.length > 0)) {
      calculateDistances();
    }
  }, [currentLocation, jobs, assignmentRequests]);

  // Periodic refresh to catch changes from other technicians
  useEffect(() => {
    if (!user?.technicianId) return;

    const interval = setInterval(() => {
      // Only refresh if there are pending assignment requests
      if (assignmentRequests.length > 0) {
        loadAssignmentRequests();
      }
    }, 5000); // Check every 5 seconds

    return () => clearInterval(interval);
  }, [user?.technicianId, assignmentRequests.length]);

  // Filter jobs based on search and status
  useEffect(() => {
    let filtered = jobs;

    // Filter by search term
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(job => {
        const jobNumber = (job as any).job_number || '';
        const customerName = (job.customer as any)?.full_name || '';
        const customerPhone = job.customer?.phone || '';
        const brand = job.brand || '';
        const model = job.model || '';
        const description = job.description || '';
        
        return (
          jobNumber.toLowerCase().includes(searchLower) ||
          customerName.toLowerCase().includes(searchLower) ||
          customerPhone.includes(searchTerm) ||
          brand.toLowerCase().includes(searchLower) ||
          model.toLowerCase().includes(searchLower) ||
          description.toLowerCase().includes(searchLower)
        );
      });
    }

    // Filter by status
    if (statusFilter === 'ONGOING') {
      // Show ongoing jobs (pending, assigned, in-progress)
      filtered = filtered.filter(job => ['PENDING', 'ASSIGNED', 'IN_PROGRESS'].includes(job.status));
    } else if (statusFilter === 'RESCHEDULED') {
      // Filter for follow-up jobs (FOLLOW_UP status)
      filtered = filtered.filter(job => job.status === 'FOLLOW_UP');
    } else if (statusFilter === 'CANCELLED') {
      // Filter for denied jobs (DENIED status)
      filtered = filtered.filter(job => job.status === 'DENIED');
    } else if (statusFilter !== 'ALL') {
      filtered = filtered.filter(job => job.status === statusFilter);
    }

    setFilteredJobs(filtered);
  }, [jobs, searchTerm, statusFilter]);

  const loadAssignedJobs = async () => {
    if (!user?.technicianId) return;

    try {
      setJobsLoading(true);
      const { data, error } = await db.jobs.getByTechnicianId(user.technicianId);
      
      if (error) {
        throw new Error(error.message);
      }

      setJobs(data || []);
    } catch (error) {
      console.error('Error loading assigned jobs:', error);
      toast.error('Failed to load assigned jobs');
    } finally {
      setJobsLoading(false);
    }
  };

  const loadAssignmentRequests = async () => {
    if (!user?.technicianId) return;

    try {
      setAssignmentRequestsLoading(true);
      const { data, error } = await db.jobAssignmentRequests.getPendingByTechnicianId(user.technicianId);
      
      if (error) {
        throw new Error(error.message);
      }

      setAssignmentRequests(data || []);
    } catch (error) {
      console.error('Error loading assignment requests:', error);
      toast.error('Failed to load assignment requests');
    } finally {
      setAssignmentRequestsLoading(false);
    }
  };

  const handleAssignmentResponse = async (requestId: string, status: 'ACCEPTED' | 'REJECTED') => {
    if (!user?.technicianId) return;

    try {
      setIsResponding(true);
      
      // First, check if this request is still valid (not already accepted by someone else)
      const currentRequest = assignmentRequests.find(req => req.id === requestId);
      if (!currentRequest) {
        toast.error('This assignment request is no longer available');
        return;
      }

      const { error } = await db.jobAssignmentRequests.respondToRequest(
        requestId, 
        status, 
        responseNotes || undefined
      );

      if (error) {
        // Handle specific case where request was already processed
        if (error.code === 'ALREADY_PROCESSED') {
          toast.error('This job has already been accepted by another technician');
          // Refresh the assignment requests to remove this one
          await loadAssignmentRequests();
          return;
        }
        throw new Error(error.message);
      }

      // If accepted, reload both assignment requests and assigned jobs
      if (status === 'ACCEPTED') {
        // Reload assignment requests to remove any cancelled ones
        await loadAssignmentRequests();
        // Reload assigned jobs to show the newly assigned job
        await loadAssignedJobs();
      } else {
        // If rejected, just remove this request
        setAssignmentRequests(prev => prev.filter(req => req.id !== requestId));
      }

      // Send notification to admin
      const request = assignmentRequests.find(req => req.id === requestId);
      if (request?.job) {
        const job = request.job as any;
        const customer = job.customer as any;
        
        const notification = status === 'ACCEPTED' 
          ? createJobAssignmentAcceptedNotification(
              job.job_number,
              customer?.full_name || 'Customer',
              user?.fullName || 'Technician',
              job.id
            )
          : createJobAssignmentRejectedNotification(
              job.job_number,
              customer?.full_name || 'Customer',
              user?.fullName || 'Technician',
              job.id
            );
        
        await sendNotification(notification);
      }

      toast.success(`Job assignment ${status.toLowerCase()} successfully`);
      setSelectedRequest(null);
      setResponseNotes('');
    } catch (error) {
      console.error('Error responding to assignment request:', error);
      toast.error('Failed to respond to assignment request');
    } finally {
      setIsResponding(false);
    }
  };

  const handleStatusUpdate = async (jobId: string, newStatus: string) => {
    try {
      setIsUpdating(true);
      
      const { error } = await db.jobs.update(jobId, { 
        status: newStatus as any,
        ...(newStatus === 'IN_PROGRESS' && { start_time: new Date().toISOString() }),
        ...(newStatus === 'COMPLETED' && { 
          end_time: new Date().toISOString()
        })
      });

      if (error) {
        throw new Error(error.message);
      }

      // Update local state
      setJobs(prev => prev.map(job => 
        job.id === jobId 
          ? { 
              ...job, 
              status: newStatus as any,
              ...(newStatus === 'IN_PROGRESS' && { start_time: new Date().toISOString() }),
              ...(newStatus === 'COMPLETED' && { 
                end_time: new Date().toISOString()
              })
            }
          : job
      ));

      toast.success(`Job status updated to ${newStatus}`);

      // Send notification for job completion
      if (newStatus === 'COMPLETED') {
        const job = jobs.find(j => j.id === jobId);
        if (job) {
          const customer = job.customer as any;
          const notification = createJobCompletedNotification(
            (job as any).job_number,
            customer?.full_name || 'Customer',
            user?.fullName || 'Technician',
            jobId
          );
          await sendNotification(notification);
        }
      }
    } catch (error) {
      console.error('Error updating job status:', error);
      toast.error('Failed to update job status');
    } finally {
      setIsUpdating(false);
    }
  };

  // Follow-up functionality handlers
  const handleScheduleFollowUp = (job: Job) => {
    setSelectedJobForFollowUp(job);
    setFollowUpModalOpen(true);
  };

  const handleFollowUpSubmit = async (jobId: string, followUpData: {
    followUpDate: string;
    followUpTime: string;
    followUpNotes?: string;
  }) => {
    try {
      const { error } = await db.jobs.update(jobId, {
        status: 'FOLLOW_UP',
        follow_up_date: followUpData.followUpDate,
        follow_up_time: followUpData.followUpTime,
        follow_up_notes: followUpData.followUpNotes || '',
        follow_up_scheduled_by: user?.id || 'technician',
        follow_up_scheduled_at: new Date().toISOString()
      });

      if (error) {
        throw new Error(error.message);
      }

      // Update local state
      setJobs(prev => prev.map(job => 
        job.id === jobId 
          ? { 
              ...job, 
              status: 'FOLLOW_UP',
              followUpDate: followUpData.followUpDate,
              followUpTime: followUpData.followUpTime,
              followUpNotes: followUpData.followUpNotes || '',
              followUpScheduledBy: user?.id || 'technician',
              followUpScheduledAt: new Date().toISOString()
            }
          : job
      ));
      
      toast.success('Follow-up scheduled successfully');
      setFollowUpModalOpen(false);
      setSelectedJobForFollowUp(null);
    } catch (error) {
      console.error('Error scheduling follow-up:', error);
      toast.error('Failed to schedule follow-up');
    }
  };

  const handleDenyJob = (job: Job) => {
    setSelectedJobForDeny(job);
    setDenyDialogOpen(true);
  };

  const handleDenyJobSubmit = async () => {
    if (!selectedJobForDeny || !denyReason.trim()) {
      toast.error('Please provide a reason for denying the job');
      return;
    }

    try {
      const { error } = await db.jobs.update(selectedJobForDeny.id, {
        status: 'DENIED',
        denial_reason: denyReason,
        denied_by: user?.id || 'technician',
        denied_at: new Date().toISOString()
      });

      if (error) {
        throw new Error(error.message);
      }

      // Update local state
      setJobs(prev => prev.map(job => 
        job.id === selectedJobForDeny.id 
          ? { 
              ...job, 
              status: 'DENIED',
              denialReason: denyReason,
              deniedBy: user?.id || 'technician',
              deniedAt: new Date().toISOString()
            }
          : job
      ));
      
      toast.success('Job denied successfully');
      setDenyDialogOpen(false);
      setSelectedJobForDeny(null);
      setDenyReason('');
    } catch (error) {
      console.error('Error denying job:', error);
      toast.error('Failed to deny job');
    }
  };

  const handleCompleteJob = (job: Job) => {
    setSelectedJobForComplete(job);
    setCompleteDialogOpen(true);
  };

  const handleCompleteJobSubmit = async () => {
    if (!selectedJobForComplete) {
      return;
    }

    try {
      const { error } = await db.jobs.update(selectedJobForComplete.id, {
        status: 'COMPLETED',
        end_time: new Date().toISOString(),
        completion_notes: completionNotes,
        completed_by: user?.id || 'technician',
        completed_at: new Date().toISOString()
      });

      if (error) {
        throw new Error(error.message);
      }

      // Update local state
      setJobs(prev => prev.map(job => 
        job.id === selectedJobForComplete.id 
          ? { 
              ...job, 
              status: 'COMPLETED',
              end_time: new Date().toISOString(),
              completionNotes: completionNotes,
              completedBy: user?.id || 'technician',
              completedAt: new Date().toISOString()
            }
          : job
      ));
      
      toast.success('Job completed successfully');
      setCompleteDialogOpen(false);
      setSelectedJobForComplete(null);
      setCompletionNotes('');
    } catch (error) {
      console.error('Error completing job:', error);
      toast.error('Failed to complete job');
    }
  };

  // Helper function to handle phone click
  const handlePhoneClick = (customer: any) => {
    const phone = customer?.phone;
    const alternatePhone = customer?.alternate_phone || customer?.alternatePhone;
    const fullName = customer?.full_name || customer?.fullName;
    
    if (alternatePhone) {
      setSelectedCustomerPhone({ phone, alternate_phone: alternatePhone, full_name: fullName });
      setPhonePopupOpen(true);
    } else if (phone) {
      window.location.href = `tel:${phone}`;
    }
  };

  // Helper function to handle WhatsApp click
  const handleWhatsAppClick = (phone: string) => {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const whatsappUrl = `https://wa.me/${cleanPhone}`;
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
  };

  // Helper function to format address for display
  const formatAddressForDisplay = (address: any) => {
    if (!address) return 'Address not available';
    const parts = [];
    if (address.street) parts.push(address.street);
    if (address.area) parts.push(address.area);
    if (address.city) parts.push(address.city);
    if (address.state) parts.push(address.state);
    if (address.pincode) parts.push(address.pincode);
    return parts.join(', ') || 'Address not available';
  };

  // Helper function to get all photos for a job
  const getAllJobPhotos = (job: Job): string[] => {
    const photos: string[] = [];
    if (job.beforePhotos && Array.isArray(job.beforePhotos)) photos.push(...job.beforePhotos);
    if (job.before_photos && Array.isArray(job.before_photos)) photos.push(...job.before_photos);
    if (job.afterPhotos && Array.isArray(job.afterPhotos)) photos.push(...job.afterPhotos);
    if (job.after_photos && Array.isArray(job.after_photos)) photos.push(...job.after_photos);
    if (job.images && Array.isArray(job.images)) photos.push(...job.images);
    return photos.filter(photo => photo && photo.trim() !== '');
  };

  // Helper function to format scheduled time
  const formatScheduledTime = (job: Job): string => {
    const scheduledDate = (job as any).scheduled_date || job.scheduledDate;
    const scheduledTimeSlot = (job as any).scheduled_time_slot || job.scheduledTimeSlot;
    const customTime = (job.customer as any)?.customTime || (job.customer as any)?.custom_time;
    
    if (!scheduledDate) return 'Not scheduled';
    
    const date = new Date(scheduledDate);
    const dateStr = date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    
    if (scheduledTimeSlot === 'CUSTOM' && customTime) {
      return `${dateStr} at ${customTime}`;
    } else if (scheduledTimeSlot) {
      const timeSlotMap: {[key: string]: string} = {
        'MORNING': 'Morning (9 AM - 12 PM)',
        'AFTERNOON': 'Afternoon (12 PM - 5 PM)',
        'EVENING': 'Evening (5 PM - 8 PM)',
        'CUSTOM': customTime || 'Custom Time'
      };
      return `${dateStr} - ${timeSlotMap[scheduledTimeSlot] || scheduledTimeSlot}`;
    }
    
    return dateStr;
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      PENDING: { color: 'bg-yellow-100 text-yellow-800', icon: Clock },
      ASSIGNED: { color: 'bg-blue-100 text-blue-800', icon: Wrench },
      IN_PROGRESS: { color: 'bg-orange-100 text-orange-800', icon: Play },
      COMPLETED: { color: 'bg-green-100 text-green-800', icon: CheckCircle },
      CANCELLED: { color: 'bg-red-100 text-red-800', icon: AlertCircle },
      RESCHEDULED: { color: 'bg-purple-100 text-purple-800', icon: CalendarPlus },
      FOLLOW_UP: { color: 'bg-indigo-100 text-indigo-800', icon: CalendarPlus },
      DENIED: { color: 'bg-red-100 text-red-800', icon: XCircle },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.PENDING;
    const Icon = config.icon;

    return (
      <Badge className={`${config.color} border-0`}>
        <Icon className="w-3 h-3 mr-1" />
        {status.replace('_', ' ')}
      </Badge>
    );
  };

  const getStatusActions = (job: Job) => {
    switch (job.status) {
      case 'ASSIGNED':
        return (
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              size="sm"
              onClick={() => handleStatusUpdate(job.id, 'IN_PROGRESS')}
              disabled={isUpdating}
              className="bg-orange-600 hover:bg-orange-700 w-full sm:w-auto"
            >
              <Play className="w-4 h-4 mr-1" />
              Start Job
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleScheduleFollowUp(job)}
              className="w-full sm:w-auto"
            >
              <CalendarPlus className="w-4 h-4 mr-1" />
              Follow-up
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleDenyJob(job)}
              className="w-full sm:w-auto text-red-600 border-red-300 hover:bg-red-50"
            >
              <XCircle className="w-4 h-4 mr-1" />
              Deny
            </Button>
          </div>
        );
      case 'IN_PROGRESS':
        return (
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              size="sm"
              onClick={() => handleCompleteJob(job)}
              disabled={isUpdating}
              className="bg-green-600 hover:bg-green-700 w-full sm:w-auto"
            >
              <CheckCircle className="w-4 h-4 mr-1" />
              Complete Job
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleScheduleFollowUp(job)}
              className="w-full sm:w-auto"
            >
              <CalendarPlus className="w-4 h-4 mr-1" />
              Follow-up
            </Button>
          </div>
        );
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  const ongoingCount = jobs.filter(job => ['PENDING', 'ASSIGNED', 'IN_PROGRESS'].includes(job.status)).length;
  const followUpCount = jobs.filter(job => job.status === 'FOLLOW_UP').length;
  const deniedCount = jobs.filter(job => job.status === 'DENIED').length;
  const completedCount = jobs.filter(job => job.status === 'COMPLETED').length;

  if (jobsLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading your assigned jobs...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-4 sm:py-0 sm:h-16">
            <div className="flex items-center mb-4 sm:mb-0">
              <Wrench className="w-8 h-8 text-blue-600 mr-3" />
              <div>
                <h1 className="text-xl font-bold text-gray-900">Technician Dashboard</h1>
                <div className="flex items-center gap-2">
                  <p className="text-sm text-gray-600">Welcome, {user?.fullName || user?.email}</p>
                  <div className="flex items-center gap-1">
                    <div className={`w-2 h-2 rounded-full ${currentLocation ? 'bg-green-500' : 'bg-yellow-500'}`} />
                    <span className="text-xs text-gray-500">
                      {currentLocation ? 'Location enabled' : 'Location needed'}
                    </span>
                    {!currentLocation && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={getCurrentLocation}
                        className="h-6 px-2 text-xs"
                      >
                        Enable
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
            
            <div className="flex items-center space-x-2 sm:space-x-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/')}
              >
                <User className="w-4 h-4 mr-2" />
                Home
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={logout}
              >
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Status Filters - Mobile First */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 mb-6">
          <button
            type="button"
            onClick={() => setStatusFilter('ONGOING')}
            className={`flex flex-col items-start justify-between rounded-xl border p-4 sm:p-5 h-full text-left transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500 ${
              statusFilter === 'ONGOING'
                ? 'bg-blue-600 text-white border-blue-600 shadow-lg'
                : 'bg-white text-gray-900 border-gray-200 shadow-sm hover:bg-blue-50 hover:border-blue-400'
            }`}
          >
            <div className="flex items-center justify-between w-full">
              <div className={`flex items-center justify-center rounded-lg p-2 ${statusFilter === 'ONGOING' ? 'bg-blue-500/40' : 'bg-blue-100 text-blue-700'}`}>
                <Clock className={`h-6 w-6 ${statusFilter === 'ONGOING' ? 'text-white' : 'text-blue-600'}`} />
              </div>
              <span className="text-xs font-medium uppercase tracking-wide opacity-80">Ongoing</span>
            </div>
            <div className="mt-4">
              <p className="text-3xl font-bold">{ongoingCount}</p>
              <p className={`mt-1 text-sm ${statusFilter === 'ONGOING' ? 'text-blue-100' : 'text-gray-500'}`}>
                Pending, assigned, and in-progress jobs
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('RESCHEDULED')}
            className={`flex flex-col items-start justify-between rounded-xl border p-4 sm:p-5 h-full text-left transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-purple-500 ${
              statusFilter === 'RESCHEDULED'
                ? 'bg-purple-600 text-white border-purple-600 shadow-lg'
                : 'bg-white text-gray-900 border-gray-200 shadow-sm hover:bg-purple-50 hover:border-purple-400'
            }`}
          >
            <div className="flex items-center justify-between w-full">
              <div className={`flex items-center justify-center rounded-lg p-2 ${statusFilter === 'RESCHEDULED' ? 'bg-purple-500/40' : 'bg-purple-100 text-purple-700'}`}>
                <CalendarPlus className={`h-6 w-6 ${statusFilter === 'RESCHEDULED' ? 'text-white' : 'text-purple-600'}`} />
              </div>
              <span className="text-xs font-medium uppercase tracking-wide opacity-80">Follow-up</span>
            </div>
            <div className="mt-4">
              <p className="text-3xl font-bold">{followUpCount}</p>
              <p className={`mt-1 text-sm ${statusFilter === 'RESCHEDULED' ? 'text-purple-100' : 'text-gray-500'}`}>
                Jobs that need another visit
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('CANCELLED')}
            className={`flex flex-col items-start justify-between rounded-xl border p-4 sm:p-5 h-full text-left transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-red-500 ${
              statusFilter === 'CANCELLED'
                ? 'bg-red-600 text-white border-red-600 shadow-lg'
                : 'bg-white text-gray-900 border-gray-200 shadow-sm hover:bg-red-50 hover:border-red-400'
            }`}
          >
            <div className="flex items-center justify-between w-full">
              <div className={`flex items-center justify-center rounded-lg p-2 ${statusFilter === 'CANCELLED' ? 'bg-red-500/40' : 'bg-red-100 text-red-700'}`}>
                <XCircle className={`h-6 w-6 ${statusFilter === 'CANCELLED' ? 'text-white' : 'text-red-600'}`} />
              </div>
              <span className="text-xs font-medium uppercase tracking-wide opacity-80">Denied</span>
            </div>
            <div className="mt-4">
              <p className="text-3xl font-bold">{deniedCount}</p>
              <p className={`mt-1 text-sm ${statusFilter === 'CANCELLED' ? 'text-red-100' : 'text-gray-500'}`}>
                Jobs declined or cancelled
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('COMPLETED')}
            className={`flex flex-col items-start justify-between rounded-xl border p-4 sm:p-5 h-full text-left transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-green-500 ${
              statusFilter === 'COMPLETED'
                ? 'bg-green-600 text-white border-green-600 shadow-lg'
                : 'bg-white text-gray-900 border-gray-200 shadow-sm hover:bg-green-50 hover:border-green-400'
            }`}
          >
            <div className="flex items-center justify-between w-full">
              <div className={`flex items-center justify-center rounded-lg p-2 ${statusFilter === 'COMPLETED' ? 'bg-green-500/40' : 'bg-green-100 text-green-700'}`}>
                <CheckCircle className={`h-6 w-6 ${statusFilter === 'COMPLETED' ? 'text-white' : 'text-green-600'}`} />
              </div>
              <span className="text-xs font-medium uppercase tracking-wide opacity-80">Completed</span>
            </div>
            <div className="mt-4">
              <p className="text-3xl font-bold">{completedCount}</p>
              <p className={`mt-1 text-sm ${statusFilter === 'COMPLETED' ? 'text-green-100' : 'text-gray-500'}`}>
                Jobs you have closed
              </p>
            </div>
          </button>
        </div>

        {/* Job Assignment Requests Section */}
        {assignmentRequests.length > 0 && (
          <Card className="mb-6 border-orange-200 bg-orange-50">
            <CardHeader>
              <CardTitle className="flex items-center text-orange-800">
                <AlertCircle className="w-5 h-5 mr-2" />
                Pending Job Assignment Requests
                {assignmentRequestsLoading && (
                  <div className="w-4 h-4 border-2 border-orange-600 border-t-transparent rounded-full animate-spin ml-2" />
                )}
              </CardTitle>
              <CardDescription className="text-orange-700">
                You have {assignmentRequests.length} pending job assignment request{assignmentRequests.length > 1 ? 's' : ''}. 
                First technician to accept gets the job.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {assignmentRequests
                  .sort((a, b) => {
                    const distanceA = distances[(a.job as any)?.id] || 999999;
                    const distanceB = distances[(b.job as any)?.id] || 999999;
                    return distanceA - distanceB;
                  })
                  .map((request) => {
                  const job = request.job as any;
                  const customer = job?.customer as any;
                  
                  return (
                    <Card key={request.id} className="border-orange-200">
                      <CardContent className="p-4">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="font-bold text-lg text-gray-900">
                                {customer?.full_name || 'N/A'}
                              </span>
                              <Badge className="bg-orange-100 text-orange-800 border-0">
                                <Clock className="w-3 h-3 mr-1" />
                                Pending Response
                              </Badge>
                            </div>
                            
                            <div className="space-y-3">
                              {/* Contact Information - Admin Style: 4 items - Desktop 1 row, Mobile 2x2 */}
                              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
                                {/* Phone */}
                                {customer?.phone && (
                                  <div className="bg-white rounded-lg p-3 border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all duration-200">
                                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                                      <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <button
                                          onClick={() => handlePhoneClick(customer)}
                                          className="cursor-pointer"
                                        >
                                          <Phone className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
                                        </button>
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="text-sm font-semibold text-gray-900 truncate">{customer.phone}</div>
                                        <div className="text-xs text-gray-500">Primary</div>
                                      </div>
                                    </div>
                                  </div>
                                )}

                                {/* WhatsApp */}
                                {customer?.phone && (
                                  <div className="bg-white rounded-lg p-3 border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all duration-200">
                                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                                      <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <button
                                          onClick={() => handleWhatsAppClick(customer.phone || '')}
                                          className="cursor-pointer"
                                        >
                                          <svg className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488"/>
                                          </svg>
                                        </button>
                              </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="text-sm font-semibold text-gray-900">WhatsApp</div>
                                        <div className="text-xs text-gray-500">Send Message</div>
                                      </div>
                                    </div>
                                  </div>
                                )}

                                {/* Location - Always shown */}
                                {(() => {
                                  const address = customer?.address || (job as any)?.service_address;
                                  return (
                                    <div className="bg-white rounded-lg p-3 border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all duration-200">
                                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                                        <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                          <button
                                            onClick={() => {
                                              if ((address as any)?.visible_address || (address as any)?.address) {
                                                setLocationDialogOpen(prev => ({ ...prev, [job.id]: true }));
                                              }
                                            }}
                                            className="cursor-pointer"
                                            disabled={!((address as any)?.visible_address || (address as any)?.address)}
                                          >
                                            <MapPin className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
                                          </button>
                              </div>
                                        <div className="flex-1 min-w-0">
                                          <div className="text-sm font-semibold text-gray-900">Location</div>
                                          <div className="text-xs text-gray-500">
                                            {(address as any)?.visible_address 
                                              ? (address as any).visible_address
                                              : (address as any)?.address
                                              ? 'View Address'
                                              : 'No location'}
                            </div>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })()}

                                {/* Photos */}
                                {(() => {
                                  const jobForPhotos = { ...job, customer } as Job;
                                  const photos = getAllJobPhotos(jobForPhotos);
                                  return (
                                    <div className="bg-white rounded-lg p-3 border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all duration-200">
                                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                                        <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                          <button
                                            onClick={() => {
                                              if (photos.length > 0) {
                                                setSelectedJobPhotos({ jobId: job.id, photos });
                                                setPhotosDialogOpen(true);
                                              }
                                            }}
                                            className="cursor-pointer"
                                            disabled={photos.length === 0}
                                          >
                                            <Camera className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
                                          </button>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <div className="text-sm font-semibold text-gray-900">Photos</div>
                                          <div className="text-xs text-gray-500">
                                            {photos.length > 0 
                                              ? `${photos.length} photo(s)`
                                              : 'No photos'}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })()}
                              </div>

                              {/* Scheduled Time */}
                              {job?.scheduled_date && (
                                <div className="flex items-center gap-2 text-sm">
                                  <Calendar className="w-4 h-4 text-gray-500" />
                                  <span className="font-medium text-gray-700">
                                    {(() => {
                                      const jobForFormat = { ...job, customer } as Job;
                                      return formatScheduledTime(jobForFormat);
                                    })()}
                                  </span>
                                </div>
                              )}

                              {/* Equipment */}
                              {job?.brand && job?.model && (
                                <div className="text-sm">
                                  <span className="font-medium text-gray-700">Equipment: </span>
                                  <span className="text-gray-600">{job.brand} - {job.model}</span>
                            </div>
                              )}

                              {/* Agreed Amount */}
                              {job?.agreed_amount || job?.estimated_cost || customer?.serviceCost ? (
                                <div className="text-sm">
                                  <span className="font-medium text-gray-700">Amount: </span>
                                  <span className="text-gray-600">₹{(job?.agreed_amount || job?.estimated_cost || customer?.serviceCost || 0).toLocaleString('en-IN')}</span>
                                </div>
                              ) : null}

                              {/* Description */}
                            {job?.description && (
                                <div className="text-sm">
                                  <span className="font-medium text-gray-700">Description: </span>
                                  <span className="text-gray-600">{job.description}</span>
                                </div>
                              )}
                            </div>
                          </div>
                          
                          <div className="flex flex-col sm:flex-row gap-2">
                            <Button
                              size="sm"
                              onClick={() => setSelectedRequest(request)}
                              className="bg-orange-600 hover:bg-orange-700"
                            >
                              <Eye className="w-4 h-4 mr-1" />
                              View Details
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleAssignmentResponse(request.id, 'ACCEPTED')}
                              disabled={isResponding}
                              className="bg-green-600 hover:bg-green-700"
                            >
                              <CheckCircle className="w-4 h-4 mr-1" />
                              Accept
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleAssignmentResponse(request.id, 'REJECTED')}
                              disabled={isResponding}
                              className="border-red-300 text-red-700 hover:bg-red-50"
                            >
                              <AlertCircle className="w-4 h-4 mr-1" />
                              Reject
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Search */}
        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Search jobs by job number, customer name, or phone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardContent>
        </Card>

        {/* Section Title */}
        <div className="mb-4">
          <h2 className="text-xl font-bold text-gray-900 mb-1">
            {statusFilter === 'ONGOING' ? 'Your Ongoing Jobs' : 
             statusFilter === 'RESCHEDULED' ? 'Your Follow-up Jobs' :
             statusFilter === 'CANCELLED' ? 'Your Denied Jobs' :
             statusFilter === 'COMPLETED' ? 'Your Completed Jobs' :
             `Your ${statusFilter} Jobs`}
          </h2>
          {!searchTerm.trim() && (
            <p className="text-xs text-gray-500 mb-3">
              {statusFilter === 'ONGOING' 
                ? `Showing ${filteredJobs.length} ongoing jobs (pending, assigned, in-progress)`
                : statusFilter === 'RESCHEDULED'
                ? `Showing ${filteredJobs.length} follow-up jobs`
                : statusFilter === 'CANCELLED'
                ? `Showing ${filteredJobs.length} denied jobs`
                : `Showing ${filteredJobs.length} ${statusFilter.toLowerCase().replace('_', ' ')} jobs`
              }
            </p>
          )}
        </div>

        {/* Jobs List */}
        <div className="space-y-4">
          {filteredJobs.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <Wrench className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No jobs found</h3>
                <p className="text-gray-600">
                  {searchTerm 
                    ? 'No jobs match your search criteria.' 
                    : statusFilter === 'ONGOING'
                    ? 'You have no ongoing jobs at the moment.'
                    : statusFilter === 'RESCHEDULED'
                    ? 'You have no follow-up jobs scheduled.'
                    : statusFilter === 'CANCELLED'
                    ? 'You have no denied jobs.'
                    : statusFilter === 'COMPLETED'
                    ? 'You have no completed jobs.'
                    : 'You have no jobs at the moment.'}
                </p>
              </CardContent>
            </Card>
          ) : (
            filteredJobs.map((job) => (
              <Card key={job.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-3">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-lg text-gray-900">
                            {(job.customer as any)?.full_name || 'N/A'}
                          </span>
                          {getStatusBadge(job.status)}
                          {distances[job.id] && (
                            <div className="text-sm text-blue-600 font-medium">
                              📍 {distances[job.id]} km
                            </div>
                          )}
                        </div>
                        <span className="text-sm text-gray-600">
                          {(job as any).service_type || job.serviceType} - {(job as any).service_sub_type || job.serviceSubType}
                        </span>
                      </div>

                      <div className="space-y-3 mb-4">
                        {/* Contact Information - Admin Style: 4 items - Desktop 1 row, Mobile 2x2 */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
                          {/* Phone */}
                          {job.customer?.phone && (
                            <div className="bg-white rounded-lg p-3 border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all duration-200">
                              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                  <button
                                    onClick={() => handlePhoneClick(job.customer)}
                                    className="cursor-pointer"
                                  >
                                    <Phone className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
                                  </button>
                          </div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-semibold text-gray-900 truncate">{job.customer.phone}</div>
                                  <div className="text-xs text-gray-500">Primary</div>
                        </div>
                              </div>
                            </div>
                          )}

                          {/* WhatsApp */}
                          {job.customer?.phone && (
                            <div className="bg-white rounded-lg p-3 border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all duration-200">
                              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                  <button
                                    onClick={() => handleWhatsAppClick(job.customer?.phone || '')}
                                    className="cursor-pointer"
                                  >
                                    <svg className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
                                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488"/>
                                    </svg>
                                  </button>
                          </div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-semibold text-gray-900">WhatsApp</div>
                                  <div className="text-xs text-gray-500">Send Message</div>
                        </div>
                              </div>
                            </div>
                          )}

                          {/* Location - Always shown */}
                          <div className="bg-white rounded-lg p-3 border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all duration-200">
                            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                <button
                                  onClick={() => {
                                    if ((job.serviceAddress as any)?.visible_address || (job.serviceAddress as any)?.address) {
                                      setLocationDialogOpen(prev => ({ ...prev, [job.id]: true }));
                                    }
                                  }}
                                  className="cursor-pointer"
                                  disabled={!((job.serviceAddress as any)?.visible_address || (job.serviceAddress as any)?.address)}
                                >
                                  <MapPin className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
                                </button>
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-semibold text-gray-900">Location</div>
                                <div className="text-xs text-gray-500">
                                  {(job.serviceAddress as any)?.visible_address 
                                    ? (job.serviceAddress as any).visible_address
                                    : (job.serviceAddress as any)?.address
                                    ? 'View Address'
                                    : 'No location'}
                                </div>
                              </div>
                            </div>
                        </div>
                        
                          {/* Photos */}
                          <div className="bg-white rounded-lg p-3 border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all duration-200">
                            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                <button
                                  onClick={() => {
                                    const photos = getAllJobPhotos(job);
                                    if (photos.length > 0) {
                                      setSelectedJobPhotos({ jobId: job.id, photos });
                                      setPhotosDialogOpen(true);
                                    }
                                  }}
                                  className="cursor-pointer"
                                  disabled={getAllJobPhotos(job).length === 0}
                                >
                                  <Camera className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
                                </button>
                          </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-semibold text-gray-900">Photos</div>
                                <div className="text-xs text-gray-500">
                                  {getAllJobPhotos(job).length > 0 
                                    ? `${getAllJobPhotos(job).length} photo(s)`
                                    : 'No photos'}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                        
                        {/* Scheduled Time and Date */}
                        <div className="flex items-center gap-2 text-sm">
                          <Calendar className="w-4 h-4 text-gray-500" />
                          <span className="font-medium text-gray-700">{formatScheduledTime(job)}</span>
                          </div>

                        {/* Equipment */}
                        {job.brand && job.model && (
                          <div className="text-sm">
                            <span className="font-medium text-gray-700">Equipment: </span>
                            <span className="text-gray-600">{job.brand} - {job.model}</span>
                            </div>
                          )}

                        {/* Agreed Amount */}
                        {(job as any).agreed_amount || (job as any).estimated_cost || (job.customer as any)?.serviceCost ? (
                          <div className="text-sm">
                            <span className="font-medium text-gray-700">Amount: </span>
                            <span className="text-gray-600">₹{((job as any).agreed_amount || (job as any).estimated_cost || (job.customer as any)?.serviceCost || 0).toLocaleString('en-IN')}</span>
                        </div>
                        ) : null}
                        
                        {/* Description */}
                        {job.description && (
                          <div className="text-sm">
                            <span className="font-medium text-gray-700">Description: </span>
                            <span className="text-gray-600">{job.description}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:ml-4">
                      {getStatusActions(job)}
                      
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm" className="w-full sm:w-auto">
                            <Eye className="w-4 h-4 mr-1" />
                            Details
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle>Job Details - {(job.customer as any)?.full_name || (job as any).job_number}</DialogTitle>
                            <DialogDescription>
                              Complete information for this service job
                            </DialogDescription>
                          </DialogHeader>
                          
                          <div className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div>
                                <label className="text-sm font-medium text-gray-700">Customer Name</label>
                                <p className="text-sm text-gray-900">{(job.customer as any)?.full_name}</p>
                              </div>
                              <div>
                                <label className="text-sm font-medium text-gray-700">Phone</label>
                                <p className="text-sm text-gray-900">{job.customer?.phone}</p>
                              </div>
                              <div>
                                <label className="text-sm font-medium text-gray-700">Email</label>
                                <p className="text-sm text-gray-900">{job.customer?.email}</p>
                              </div>
                              <div>
                                <label className="text-sm font-medium text-gray-700">Status</label>
                                <div className="mt-1">{getStatusBadge(job.status)}</div>
                              </div>
                            </div>
                            
                            <div>
                              <label className="text-sm font-medium text-gray-700">Service Address</label>
                              <p className="text-sm text-gray-900">
                                {(job.serviceAddress as any)?.address || 'Address not available'}
                              </p>
                            </div>
                            
                            <div>
                              <label className="text-sm font-medium text-gray-700">Description</label>
                              <p className="text-sm text-gray-900">{job.description}</p>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Assignment Request Details Dialog */}
        <Dialog open={!!selectedRequest} onOpenChange={() => setSelectedRequest(null)}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Job Assignment Request Details</DialogTitle>
              <DialogDescription>
                Review the job details before accepting or rejecting this assignment
              </DialogDescription>
            </DialogHeader>
            
            {selectedRequest && (
              <div className="space-y-6">
                {(() => {
                  const job = selectedRequest.job as any;
                  const customer = job?.customer as any;
                  
                  return (
                    <>
                      {/* Job Info */}
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="font-bold text-xl text-gray-900">
                            {customer?.full_name || 'N/A'}
                          </span>
                          <Badge className="bg-orange-100 text-orange-800 border-0">
                            <Clock className="w-3 h-3 mr-1" />
                            Pending Response
                          </Badge>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                          <div>
                            <p><strong>Service Type:</strong> {job?.service_type} - {job?.service_sub_type}</p>
                            <p><strong>Brand/Model:</strong> {job?.brand} {job?.model}</p>
                            <p><strong>Priority:</strong> {job?.priority}</p>
                            <p><strong>Estimated Cost:</strong> ₹{job?.estimated_cost}</p>
                          </div>
                          <div>
                            <p><strong>Scheduled Date:</strong> {job?.scheduled_date}</p>
                            <p><strong>Time Slot:</strong> {job?.scheduled_time_slot}</p>
                            <p><strong>Duration:</strong> {job?.estimated_duration} minutes</p>
                          </div>
                        </div>
                      </div>

                      {/* Customer Info */}
                      <div className="bg-blue-50 p-4 rounded-lg">
                        <h4 className="font-semibold text-blue-900 mb-3">Customer Information</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                          <div>
                            <p><strong>Name:</strong> {customer?.full_name || 'N/A'}</p>
                            {customer?.phone && <p><strong>Phone:</strong> {customer.phone}</p>}
                            {customer?.email && <p><strong>Email:</strong> {customer.email}</p>}
                          </div>
                          <div>
                            <p><strong>Address:</strong></p>
                            <p className="text-gray-700">
                              {((customer?.address as any)?.street || (customer?.address as any)?.area) && (
                                <>
                                  {(customer?.address as any)?.street || ''}<br/>
                                  {(customer?.address as any)?.area || ''}<br/>
                                </>
                              )}
                              {((customer?.address as any)?.city || (customer?.address as any)?.pincode) && (
                                <>{(customer?.address as any)?.city || ''} - {(customer?.address as any)?.pincode || ''}</>
                              )}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Job Description */}
                      {job?.description && (
                        <div>
                          <h4 className="font-semibold text-gray-900 mb-2">Job Description</h4>
                          <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded-lg">
                            {job.description}
                          </p>
                        </div>
                      )}

                      {/* Response Notes */}
                      <div>
                        <label htmlFor="response-notes" className="block text-sm font-medium text-gray-700 mb-2">
                          Response Notes (Optional)
                        </label>
                        <Textarea
                          id="response-notes"
                          placeholder="Add any notes about your response..."
                          value={responseNotes}
                          onChange={(e) => setResponseNotes(e.target.value)}
                          rows={3}
                        />
                      </div>

                      {/* Action Buttons */}
                      <div className="flex justify-end gap-3 pt-4 border-t">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setSelectedRequest(null);
                            setResponseNotes('');
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => handleAssignmentResponse(selectedRequest.id, 'REJECTED')}
                          disabled={isResponding}
                          className="border-red-300 text-red-700 hover:bg-red-50"
                        >
                          <AlertCircle className="w-4 h-4 mr-2" />
                          Reject Assignment
                        </Button>
                        <Button
                          onClick={() => handleAssignmentResponse(selectedRequest.id, 'ACCEPTED')}
                          disabled={isResponding}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Accept Assignment
                        </Button>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Follow-up Modal */}
        <FollowUpModal
          isOpen={followUpModalOpen}
          onClose={() => {
            setFollowUpModalOpen(false);
            setSelectedJobForFollowUp(null);
          }}
          job={selectedJobForFollowUp}
          onScheduleFollowUp={handleFollowUpSubmit}
        />

        {/* Deny Job Dialog */}
        <Dialog open={denyDialogOpen} onOpenChange={setDenyDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Deny Job</DialogTitle>
              <DialogDescription>
                Are you sure you want to deny this job? Please provide a reason.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              {selectedJobForDeny && (
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-medium text-gray-900 mb-2">Job Details</h4>
                  <p className="text-sm text-gray-600">
                    <strong>Job Number:</strong> {(selectedJobForDeny as any).job_number}
                  </p>
                  <p className="text-sm text-gray-600">
                    <strong>Customer:</strong> {(selectedJobForDeny.customer as any)?.full_name || 'Unknown'}
                  </p>
                  <p className="text-sm text-gray-600">
                    <strong>Service:</strong> {selectedJobForDeny.serviceType} - {selectedJobForDeny.serviceSubType}
                  </p>
                </div>
              )}
              
              <div>
                <label htmlFor="deny-reason" className="block text-sm font-medium text-gray-700 mb-2">
                  Reason for Denial *
                </label>
                <Textarea
                  id="deny-reason"
                  placeholder="Please provide a reason for denying this job..."
                  value={denyReason}
                  onChange={(e) => setDenyReason(e.target.value)}
                  rows={3}
                  required
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => {
                  setDenyDialogOpen(false);
                  setSelectedJobForDeny(null);
                  setDenyReason('');
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleDenyJobSubmit}
                className="bg-red-600 hover:bg-red-700"
              >
                <XCircle className="w-4 h-4 mr-2" />
                Deny Job
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Complete Job Dialog */}
        <Dialog open={completeDialogOpen} onOpenChange={setCompleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Complete Job</DialogTitle>
              <DialogDescription>
                Mark this job as completed. You can add completion notes if needed.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              {selectedJobForComplete && (
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-medium text-gray-900 mb-2">Job Details</h4>
                  <p className="text-sm text-gray-600">
                    <strong>Job Number:</strong> {(selectedJobForComplete as any).job_number}
                  </p>
                  <p className="text-sm text-gray-600">
                    <strong>Customer:</strong> {(selectedJobForComplete.customer as any)?.full_name || 'Unknown'}
                  </p>
                  <p className="text-sm text-gray-600">
                    <strong>Service:</strong> {selectedJobForComplete.serviceType} - {selectedJobForComplete.serviceSubType}
                  </p>
                </div>
              )}
              
              <div>
                <label htmlFor="completion-notes" className="block text-sm font-medium text-gray-700 mb-2">
                  Completion Notes (Optional)
                </label>
                <Textarea
                  id="completion-notes"
                  placeholder="Add any notes about the completion..."
                  value={completionNotes}
                  onChange={(e) => setCompletionNotes(e.target.value)}
                  rows={3}
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => {
                  setCompleteDialogOpen(false);
                  setSelectedJobForComplete(null);
                  setCompletionNotes('');
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCompleteJobSubmit}
                className="bg-green-600 hover:bg-green-700"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Complete Job
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Phone Numbers Dialog */}
        <Dialog open={phonePopupOpen} onOpenChange={setPhonePopupOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Phone className="w-5 h-5 text-blue-600" />
                Contact Numbers
              </DialogTitle>
              <DialogDescription>
                Choose a phone number to call for {selectedCustomerPhone?.full_name || 'customer'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {/* Primary Phone */}
              {selectedCustomerPhone?.phone && (
                <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <div>
                    <div className="font-semibold text-gray-900">{selectedCustomerPhone.phone}</div>
                    <div className="text-sm text-blue-600 font-medium">Primary Number</div>
      </div>
                  <a 
                    href={`tel:${selectedCustomerPhone.phone}`}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                  >
                    Call
                  </a>
                </div>
              )}
              
              {/* Secondary Phone */}
              {selectedCustomerPhone?.alternate_phone && (
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div>
                    <div className="font-semibold text-gray-900">{selectedCustomerPhone.alternate_phone}</div>
                    <div className="text-sm text-gray-600 font-medium">Secondary Number</div>
                  </div>
                  <a 
                    href={`tel:${selectedCustomerPhone.alternate_phone}`}
                    className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                  >
                    Call
                  </a>
                </div>
              )}
            </div>
            <div className="flex justify-end pt-4 border-t">
              <Button 
                variant="outline" 
                onClick={() => setPhonePopupOpen(false)}
              >
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Location Dialog */}
        {filteredJobs.map((job) => {
          if (!locationDialogOpen[job.id]) return null;
          const address = job.serviceAddress as any;
          return (
            <Dialog 
              key={`location-${job.id}`}
              open={locationDialogOpen[job.id] || false} 
              onOpenChange={(open) => setLocationDialogOpen(prev => ({ ...prev, [job.id]: open }))}
            >
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-blue-600" />
                    Full Address
                  </DialogTitle>
                  <DialogDescription>
                    Complete address for {(job.customer as any)?.full_name || 'customer'}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-2">
                  {address?.visible_address && (
                    <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="text-xs text-blue-600 font-medium mb-1">Location</div>
                    <div className="font-semibold text-gray-900">{address.visible_address}</div>
                  </div>
                  )}
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <div className="text-xs text-gray-600 font-medium mb-2">Complete Address</div>
                    <div className="text-sm text-gray-900 whitespace-pre-line">
                      {formatAddressForDisplay(address)}
                    </div>
                  </div>
                  {distances[job.id] && (
                    <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                      <div className="text-sm text-green-700">
                        <MapPin className="w-4 h-4 inline mr-1" />
                        {distances[job.id]} km away
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex justify-end pt-4 border-t">
                  <Button 
                    variant="outline" 
                    onClick={() => setLocationDialogOpen(prev => ({ ...prev, [job.id]: false }))}
                  >
                    Close
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          );
        })}

        {/* Photos Dialog */}
        <Dialog open={photosDialogOpen} onOpenChange={setPhotosDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Camera className="w-5 h-5 text-blue-600" />
                Job Photos
              </DialogTitle>
              <DialogDescription>
                All photos associated with this job
              </DialogDescription>
            </DialogHeader>
            {selectedJobPhotos && selectedJobPhotos.photos.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 py-4">
                {selectedJobPhotos.photos.map((photo, index) => (
                  <div key={index} className="relative group">
                    <div className="w-full h-48 bg-gray-100 rounded-lg border border-gray-200 overflow-hidden cursor-pointer">
                      <img
                        src={photo}
                        alt={`Photo ${index + 1}`}
                        className="w-full h-full object-cover transition-transform group-hover:scale-105"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                          const placeholder = (e.target as HTMLImageElement).nextElementSibling as HTMLElement;
                          if (placeholder) placeholder.style.display = 'flex';
                        }}
                        onClick={() => window.open(photo, '_blank', 'noopener,noreferrer')}
                      />
                      <div 
                        className="hidden w-full h-full items-center justify-center bg-gray-200 text-gray-400"
                        style={{ display: 'none' }}
                      >
                        <Camera className="w-8 h-8" />
                      </div>
                    </div>
                    <div className="mt-1 text-xs text-center text-gray-500">Photo {index + 1}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-gray-500">
                <Camera className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p>No photos available for this job</p>
              </div>
            )}
            <div className="flex justify-end pt-4 border-t">
              <Button 
                variant="outline" 
                onClick={() => {
                  setPhotosDialogOpen(false);
                  setSelectedJobPhotos(null);
                }}
              >
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default TechnicianDashboard;
