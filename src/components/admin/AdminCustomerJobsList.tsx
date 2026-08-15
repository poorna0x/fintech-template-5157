import React, { memo, useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Wrench,
  Clock,
  CheckCircle,
  AlertCircle,
  MapPin,
  Edit,
  Trash2,
  MoreVertical,
  Plus,
  User,
  Camera,
  History,
  FileText,
  Star,
  Eye,
  Send,
  Image,
  Calendar,
  CalendarPlus,
  XCircle,
  CheckCircle2,
  Tag,
  MessageSquare,
  Navigation,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  X,
  UserPlus,
  ArrowRight,
  KeyRound,
  Bell,
} from 'lucide-react';
import AskTechnicianOtpDialog from './AskTechnicianOtpDialog';
import JobTechCustomNudgeDialog from './JobTechCustomNudgeDialog';
import JobTechNudgePickerDialog from './JobTechNudgePickerDialog';
import { CustomerCardHeader } from './CustomerCardHeader';
import { ContactSection } from './ContactSection';
import { CompletedJobSection } from './CompletedJobSection';
import { DeniedJobSection } from './DeniedJobSection';
import { FollowUpJobSection } from './FollowUpJobSection';
import { StatusBadge } from './StatusBadge';
import { WhatsAppIcon } from '../WhatsAppIcon';
import { useAdminDashboardList } from '@/contexts/AdminDashboardListContext';
import { parseAdminDashboardUrl } from '@/lib/adminDashboardUrl';
import {
  findLeadSource,
  getLeadSourceFromJob,
  getJobCustomTimeLabel,
  normalizeLeadType,
  normalizeServiceSubType,
  formatPreferredTimeSlot,
  getFormattedTimeSlot,
  extractPhotoUrls,
  normalizePhotoUrl,
  parseJobRequirements,
  completedJobMatchesDashboardClientFilters,
  isOfficeCompletedJob,
  ZERO_COMMISSION_EMPLOYEE_ID,
  resolveJobEquipment,
  isOpenAmcServiceJob,
} from '@/lib/adminUtils';
import type { Job } from '@/types';
import { useFollowUpGlowEnabled } from '@/hooks/useFollowUpGlowEnabled';
import { fetchSubmittedJobReviewRatingsByJobIds } from '@/lib/jobReviews';

export const AdminCustomerJobsList = memo(function AdminCustomerJobsList() {
  const ctx = useAdminDashboardList();
  const {
    displayedCustomers,
    statusFilter,
    todayDateStr,
    tomorrowDateStr,
    followUpDateToStr,
    customerAMCStatus,
    customerPriorServiceStatus,
    isLoadingPhotos,
    selectedCustomerForPhotos,
    currentLocation,
    isGettingLocation,
    customerDistances,
    technicians,
    techniciansForReports,
    location,
    completedDatePreset,
    completedDateFilter,
    completedLeadTypeFilter,
    completedServiceSubTypeFilter,
    completedByFilter,
    loadedCompletedJobDetails,
    loadingCompletedJobDetails,
    highlightJobId,
    doesOngoingJobMatchFilters,
    getJobCompletionDate,
    applyListCustomerContactToCachedJob,
  } = ctx.data;
  const a = ctx.actionsRef.current;
  const followUpGlowEnabled = useFollowUpGlowEnabled();

  // "Ask OTP": request the customer's OTP from the assigned technician's app
  // (Home Triangle leads, or any job with Require OTP checked).
  const [otpJob, setOtpJob] = useState<Job | null>(null);
  const [customNudgeJob, setCustomNudgeJob] = useState<Job | null>(null);
  const [nudgePickerJob, setNudgePickerJob] = useState<Job | null>(null);
  const [reviewRatings, setReviewRatings] = useState<Record<string, number>>({});

  const completedJobIdsKey = useMemo(() => {
    const ids = displayedCustomers.flatMap(({ completedJobs }) =>
      (completedJobs || []).map((j) => j.id).filter(Boolean)
    );
    return [...new Set(ids)].sort().join(',');
  }, [displayedCustomers]);

  useEffect(() => {
    if (!completedJobIdsKey) {
      setReviewRatings({});
      return;
    }
    const ids = completedJobIdsKey.split(',');
    let cancelled = false;
    void fetchSubmittedJobReviewRatingsByJobIds(ids).then((map) => {
      if (!cancelled) setReviewRatings(map);
    });
    return () => {
      cancelled = true;
    };
  }, [completedJobIdsKey]);

  const distantFollowUpCutoff = new Date();
  distantFollowUpCutoff.setHours(0, 0, 0, 0);
  distantFollowUpCutoff.setDate(distantFollowUpCutoff.getDate() + 3);
  const distantFollowUpCutoffYmd = `${distantFollowUpCutoff.getFullYear()}-${String(
    distantFollowUpCutoff.getMonth() + 1
  ).padStart(2, '0')}-${String(distantFollowUpCutoff.getDate()).padStart(2, '0')}`;

  return (
    <>
      {displayedCustomers.map(({ customer, allJobs, upcomingJobs, completedJobs, cancelledJobs }) => {
  // Check if this customer has followup jobs scheduled for today or tomorrow (for card border)
  const hasTodayFollowup = statusFilter === 'RESCHEDULED' && allJobs.some(job => {
    if (!['FOLLOW_UP', 'RESCHEDULED'].includes(job.status)) return false;
    const dateStr = followUpDateToStr(job.followUpDate || (job as any).follow_up_date);
    return dateStr === todayDateStr;
  });
  const hasTomorrowFollowup = statusFilter === 'RESCHEDULED' && !hasTodayFollowup && allJobs.some(job => {
    if (!['FOLLOW_UP', 'RESCHEDULED'].includes(job.status)) return false;
    const dateStr = followUpDateToStr(job.followUpDate || (job as any).follow_up_date);
    return dateStr === tomorrowDateStr;
  });
  // Check if this customer has any job with lead source Website
  const hasWebsiteLead = allJobs.some(job => {
    const reqs = (job as any).requirements;
    const arr = Array.isArray(reqs) ? reqs : reqs && typeof reqs === 'object' ? [reqs] : [];
    const lead = (findLeadSource(arr) || '').toLowerCase();
    return lead.includes('website');
  });
  const hasOpenAmcServiceJob = allJobs.some((job) => isOpenAmcServiceJob(job));
  const normalFollowUps =
    statusFilter === 'RESCHEDULED'
      ? allJobs.filter(
          (job) =>
            ['FOLLOW_UP', 'RESCHEDULED'].includes(job.status) &&
            !isOpenAmcServiceJob(job)
        )
      : [];
  const normalFollowUpDates = normalFollowUps
    .map((job) => followUpDateToStr(job.followUpDate || (job as any).follow_up_date))
    .filter((date): date is string => Boolean(date));
  const isDistantNormalFollowUp =
    normalFollowUps.length > 0 &&
    normalFollowUpDates.length === normalFollowUps.length &&
    normalFollowUpDates.every((date) => date > distantFollowUpCutoffYmd);
  // AMC due / open AMC Service jobs → blue border.
  const borderClass = hasOpenAmcServiceJob
    ? 'border-blue-500 border-2'
    : followUpGlowEnabled && hasTodayFollowup
      ? 'border-red-400 border-2'
      : followUpGlowEnabled && hasTomorrowFollowup
        ? 'border-yellow-400 border-2'
        : hasWebsiteLead
          ? 'border-red-400 border-2'
          : 'border-gray-300';
  const hoverBorderClass = hasWebsiteLead || hasOpenAmcServiceJob ? 'hover:border-green-400' : 'hover:border-gray-400';
  const priorServiceFromJobs =
    completedJobs.length > 0 ||
    allJobs.some(
      (job) =>
        job.status === 'COMPLETED' || (job as any).status === 'COMPLETED'
    );

  return (
    <Card
      key={customer.id}
      title={isDistantNormalFollowUp ? 'Future follow-up — not included in the count yet' : undefined}
      className={`bg-white border ${borderClass} ${hoverBorderClass} hover:shadow-md transition-all duration-200 overflow-hidden mb-6 rounded-lg group ${
        isDistantNormalFollowUp ? 'opacity-60 saturate-[0.65]' : ''
      }`}
    >
    <CustomerCardHeader
      customer={customer}
      customerAMCStatus={customerAMCStatus}
      customerPriorServiceStatus={customerPriorServiceStatus}
      priorServiceFromJobs={priorServiceFromJobs}
      isLoadingPhotos={isLoadingPhotos}
      selectedCustomerForPhotos={selectedCustomerForPhotos}
      onEditCustomer={a.handleEditCustomer}
      onNewJob={a.handleNewJob}
      onViewPhotos={a.handleViewPhotos}
      onGenerateBill={a.handleGenerateBill}
      onGenerateQuotation={a.handleGenerateQuotation}
      onGenerateAMC={a.handleGenerateAMC}
      onGenerateTaxInvoice={a.handleGenerateTaxInvoice}
      onOpenCustomerReport={a.handleOpenCustomerReport}
      onViewAMCInfo={a.handleViewAMCInfo}
      onAddReminder={(customer) => {
        a.setReminderEntity({ type: 'customer', id: customer.id });
        a.setReminderContextLabel(`${(customer as any).full_name || customer.fullName} (Customer)`);
        a.openAdminModal('add-reminder', { customerId: customer.id });
      }}
      onViewReminders={(customer) => a.setViewRemindersCustomer(customer)}
      onManageWarranty={(customer) => {
        a.openAdminModal('warranty', { customerId: customer.id });
      }}
    />

    {/* Contact & Communication - Mobile First */}
    <ContactSection
      customer={customer}
      handlePhoneClick={a.handlePhoneClick}
      handleWhatsAppClick={a.handleWhatsAppClick}
      currentLocation={currentLocation}
      isGettingLocation={isGettingLocation}
      customerDistances={customerDistances}
      setCurrentLocation={a.setCurrentLocation}
      setIsGettingLocation={a.setIsGettingLocation}
      setAddressDialogOpen={a.setAddressDialogOpen}
      setAddressLocationVariant={a.setAddressLocationVariant}
      hydrateCustomerForMaps={a.hydrateCustomerForMaps}
    />

                    {/* Services Section - Always show, even if no jobs */}
    <div className="p-4 bg-gray-50">
      <div className="mb-4">
        <h3 className="text-xl font-semibold text-gray-900 flex items-center gap-3">                                                              
          <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">                                                       
            <Wrench className="w-4 h-4 text-gray-600" />
          </div>
          Service History ({allJobs.length})
        </h3>
        <p className="text-sm text-gray-600 mt-1">All service requests and job details</p>                                                        
      </div>
      
      {allJobs.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <Wrench className="w-12 h-12 mx-auto mb-3 text-gray-400" />
          <p className="text-sm">No service history found for this customer</p>
        </div>
      ) : (

                            <div className="space-y-4">
          {(() => {
            // Show jobs based on current filter
            let jobsToShow = allJobs;
            if (statusFilter === 'ALL') {
              // Show all jobs when filter is 'ALL'
              jobsToShow = allJobs;
            } else if (statusFilter === 'ONGOING') {
              // Show ongoing jobs (pending, assigned, in-progress)
              jobsToShow = allJobs.filter((job: any) => doesOngoingJobMatchFilters(job));
              // Sort by created_at (newest/recently created first)
              jobsToShow.sort((a, b) => {
                const aCreated = new Date((a as any).created_at || a.createdAt || 0).getTime();
                const bCreated = new Date((b as any).created_at || b.createdAt || 0).getTime();
                return bCreated - aCreated; // Newest first
              });
            } else if (statusFilter === 'RESCHEDULED') {
              // Show follow-up jobs (FOLLOW_UP and RESCHEDULED)
              jobsToShow = allJobs.filter(job => ['FOLLOW_UP', 'RESCHEDULED'].includes(job.status));
              // Sort by follow-up date: today first, tomorrow next, then by date ascending
              jobsToShow.sort((a, b) => {
                const aStr = followUpDateToStr((a as any).follow_up_date || a.followUpDate);
                const bStr = followUpDateToStr((b as any).follow_up_date || b.followUpDate);
                if (!aStr && !bStr) return 0;
                if (!aStr) return 1;
                if (!bStr) return -1;
                const aRank = aStr === todayDateStr ? 0 : aStr === tomorrowDateStr ? 1 : 2;
                const bRank = bStr === todayDateStr ? 0 : bStr === tomorrowDateStr ? 1 : 2;
                if (aRank !== bRank) return aRank - bRank;
                return new Date((a as any).follow_up_date || a.followUpDate).getTime() - new Date((b as any).follow_up_date || b.followUpDate).getTime();
              });
            } else if (statusFilter === 'CANCELLED') {
              // Show denied jobs (DENIED status)
              jobsToShow = allJobs.filter(job => job.status === 'DENIED');
            } else if (statusFilter === 'COMPLETED') {
              // For completed view, customer grouping already applied completed filters.
              // Avoid re-filtering here to keep rendering fast on large result sets.
              jobsToShow = [...completedJobs].sort((a, b) => getJobCompletionDate(b) - getJobCompletionDate(a));
            } else {
              jobsToShow = allJobs.filter(job => job.status === statusFilter);
              // Sort follow-up jobs by closest date first
              if (statusFilter === 'FOLLOW_UP') {
                jobsToShow.sort((a, b) => {
                  const aFollowUpDate = (a as any).follow_up_date || a.followUpDate;
                  const bFollowUpDate = (b as any).follow_up_date || b.followUpDate;
                  if (!aFollowUpDate && !bFollowUpDate) return 0;
                  if (!aFollowUpDate) return 1; // No date goes to end
                  if (!bFollowUpDate) return -1; // No date goes to end
                  return new Date(aFollowUpDate).getTime() - new Date(bFollowUpDate).getTime();
                });
              }
            }
            
            // Debug logging (optional)
            if (import.meta.env.DEV) {
              // dev-only logging can go here
            }
            
                                    return jobsToShow.length === 0 ? (
              <div key="no-jobs" className="text-center py-8 text-gray-500">
                <p className="text-sm">No jobs match the current filter</p>
              </div>
            ) : jobsToShow.map((job) => {
            const beforePhotos = Array.isArray(job.before_photos || job.beforePhotos) ? (job.before_photos || job.beforePhotos) : [];               
            const afterPhotos = Array.isArray(job.after_photos || job.afterPhotos) ? (job.after_photos || job.afterPhotos) : [];                    
            
            const allPhotos = [...extractPhotoUrls(beforePhotos), ...extractPhotoUrls(afterPhotos)];                                                
            const followUpDate = (job as any).follow_up_date || job.followUpDate || null;
            const followUpTime = (job as any).follow_up_time || job.followUpTime || null;
            const followUpNotes = (job as any).follow_up_notes || job.followUpNotes || '';
            const followUpScheduledAt = (job as any).follow_up_scheduled_at || job.followUpScheduledAt || null;
            const followUpScheduledBy = (job as any).follow_up_scheduled_by || job.followUpScheduledBy || null;
            const formattedFollowUpDate = followUpDate ? (() => {
              const date = new Date(followUpDate);
              const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
              const dateStr = date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
              return `${dayName}, ${dateStr}`;
            })() : null;
            const formattedFollowUpTime = followUpTime ? (() => {
              const timeString = String(followUpTime);
              const [hours, minutes] = timeString.split(':');
              if (!hours || !minutes) {
                return timeString;
              }
              const hourNum = parseInt(hours, 10);
              if (Number.isNaN(hourNum)) {
                return timeString;
              }
              const normalizedHour = ((hourNum % 12) + 12) % 12 || 12;
              const suffix = hourNum >= 12 ? 'PM' : 'AM';
              return `${normalizedHour}:${minutes.padEnd(2, '0')} ${suffix}`;
            })() : null;
            const formattedFollowUpScheduledAt = followUpScheduledAt ? new Date(followUpScheduledAt).toLocaleString() : null;
            // Determine who scheduled the follow-up
            // Both admins and technicians now store UUID
            // Check if UUID is in technicians list → show technician name
            // If UUID is NOT in technicians list → show "Admin" (admins aren't technicians)
            // If it's a string (old data) → show that string for backward compatibility
            const isUUID = followUpScheduledBy && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(followUpScheduledBy);
            let followUpScheduledByName = 'Admin';
            
            if (isUUID) {
              // It's a UUID - check if it's a technician ID
              const followUpScheduledByTechnician = technicians.find(tech => tech.id === followUpScheduledBy);
              followUpScheduledByName = followUpScheduledByTechnician?.fullName || 'Admin';
            } else if (followUpScheduledBy) {
              // It's a string (old data format) - show it directly for backward compatibility
              followUpScheduledByName = followUpScheduledBy;
            } else if (followUpScheduledBy === 'admin') {
              followUpScheduledByName = 'Admin';
            } else if (followUpScheduledBy === 'technician') {
              followUpScheduledByName = 'Technician';
            }
            
            const denialReason = (job as any).denial_reason || job.denialReason || '';
            const deniedBy = (job as any).denied_by || job.deniedBy || '';
            const deniedAt = (job as any).denied_at || job.deniedAt || null;
            const formattedDeniedAt = deniedAt ? new Date(deniedAt).toLocaleString() : null;
            
            // Extract completion details
            const completionNotes = (job as any).completion_notes || job.completionNotes || '';
            const completedAt = (job as any).completed_at || job.completedAt || null;
            // Format date as "January 5th 2026" with 12-hour time format
            const formattedCompletedAt = completedAt ? (() => {
              const date = new Date(completedAt);
              const day = date.getDate();
              const month = date.toLocaleString('en-US', { month: 'long' });
              const year = date.getFullYear();
              // Get ordinal suffix (1st, 2nd, 3rd, 4th, etc.)
              const getOrdinalSuffix = (n: number) => {
                const s = ['th', 'st', 'nd', 'rd'];
                const v = n % 100;
                return s[(v - 20) % 10] || s[v] || s[0];
              };
              // Format time as 12-hour format (5:30 PM)
              const hours = date.getHours();
              const minutes = date.getMinutes();
              const ampm = hours >= 12 ? 'PM' : 'AM';
              const displayHours = hours % 12 || 12;
              const displayMinutes = minutes.toString().padStart(2, '0');
              const timeStr = `${displayHours}:${displayMinutes} ${ampm}`;
              return `${month} ${day}${getOrdinalSuffix(day)} ${year} at ${timeStr}`;
            })() : null;
            const isDefaultCompletedDateFilter =
              completedDatePreset === 'day' &&
              completedDateFilter === todayDateStr;
            const hasAnyCompletedFilterSelected =
              !isDefaultCompletedDateFilter ||
              completedLeadTypeFilter !== 'all' ||
              completedServiceSubTypeFilter !== 'all' ||
              completedByFilter !== 'all';
            const minimalCompletedMode = hasAnyCompletedFilterSelected;
            // Cached "full" job is only fetched once per id; list rows refresh after edits.
            // Overlay list financial columns so lead_cost / parts / payment stay accurate on the card.
            const cachedCompleted = loadedCompletedJobDetails[job.id];
            const fullJob = cachedCompleted
              ? (() => {
                  const c = cachedCompleted as any;
                  const j = job as any;
                  let out = { ...c };
                  for (const k of [
                    'lead_cost',
                    'parts_cost_total',
                    'payment_amount',
                    'actual_cost',
                    'payment_method',
                  ] as const) {
                    if (j[k] !== undefined && j[k] !== null) {
                      out[k] = j[k];
                    }
                  }
                  out = applyListCustomerContactToCachedJob(out, j);
                  return out;
                })()
              : job;
            const detailsLoaded = Boolean(loadedCompletedJobDetails[job.id]);
            const isLoadingDetails = Boolean(loadingCompletedJobDetails[job.id]);

            const completedBy = (fullJob as any).completed_by || (fullJob as any).completedBy || null;
            const actualCost = (fullJob as any).actual_cost || (fullJob as any).actualCost || null;
            const paymentAmount = (fullJob as any).payment_amount || (fullJob as any).paymentAmount || null;
            const paymentMethod = (fullJob as any).payment_method || (fullJob as any).paymentMethod || null;
            
            // Get technician name who completed the job
            const isDirectSale = ((fullJob as any).service_sub_type || (fullJob as any).serviceSubType) === 'Direct Sale';
            let completedByName = 'Unknown';
            if (isDirectSale || isOfficeCompletedJob(fullJob)) {
              completedByName = 'Office';
            } else if (completedBy) {
              if (completedBy === 'admin' || completedBy === 'Admin') {
                completedByName = 'Admin';
              } else {
                const completedByTechnician = (techniciansForReports.length > 0 ? techniciansForReports : technicians).find(
                  (tech: any) => (tech.id || (tech as any).id) === completedBy
                );
                completedByName =
                  completedByTechnician?.fullName ||
                  (completedByTechnician as any)?.full_name ||
                  'Technician';
              }
            }
            
            // Parse requirements to get AMC info, bill photos, payment screenshot
            // IMPORTANT: In minimal mode, don't parse anything until user clicks "Load details".
            const requirements = minimalCompletedMode && !detailsLoaded
              ? []
              : parseJobRequirements((fullJob as any).requirements || (fullJob as any).requirements || []);

            const amcInfo = minimalCompletedMode && !detailsLoaded
              ? null
              : requirements.find((r: any) => r?.amc_info)?.amc_info || null;

            const qrPhotos = minimalCompletedMode && !detailsLoaded
              ? null
              : requirements.find((r: any) => r?.qr_photos)?.qr_photos || null;
            
            // Extract payment screenshot from multiple sources:
            // 1. qr_photos.payment_screenshot (for ONLINE payments)
            // 2. requirements.payment_photos (for CASH payments with payment screenshot)
            // 3. after_photos (fallback - payment screenshot should be there)
            let paymentScreenshot: string | null = null;
            
            // First, try to get from qr_photos (ONLINE payments)
            if (qrPhotos?.payment_screenshot) {
              paymentScreenshot = normalizePhotoUrl(qrPhotos.payment_screenshot);
            }

            // If not found in qr_photos, check payment_photos in requirements (CASH payments)
            if (!paymentScreenshot) {
              const paymentPhotosReq = requirements.find((r: any) => r?.payment_photos);
              if (paymentPhotosReq?.payment_photos && Array.isArray(paymentPhotosReq.payment_photos) && paymentPhotosReq.payment_photos.length > 0) {
                paymentScreenshot = normalizePhotoUrl(paymentPhotosReq.payment_photos[0]);
              }
            }
            
            // Extract all photos from after_photos field (includes both bill photos and payment screenshot)
            const afterPhotosExtracted = minimalCompletedMode && !detailsLoaded ? [] : extractPhotoUrls(afterPhotos);

            // Also get bill photos from requirements (for backward compatibility)
            const billPhotosFromRequirements = minimalCompletedMode && !detailsLoaded
              ? []
              : extractPhotoUrls(requirements.find((r: any) => r?.bill_photos)?.bill_photos || []);
            
            // Use after_photos as primary source (it contains all photos including payment screenshot)
            // If after_photos is empty, fallback to requirements.bill_photos
            let billPhotos: string[] = [];
            
            // Helper function to normalize URLs for comparison
            const normalizeUrl = (url: string) => url.split('?')[0].split('#')[0].trim().toLowerCase();
            
            if (afterPhotosExtracted.length > 0) {
              // If we have a payment screenshot from qr_photos, exclude it from bill photos
              if (paymentScreenshot) {
                const normalizedPaymentScreenshot = normalizeUrl(paymentScreenshot);
                
                billPhotos = afterPhotosExtracted.filter(url => {
                  const normalizedUrl = normalizeUrl(url);
                  return normalizedUrl !== normalizedPaymentScreenshot;
                });
              } else {
                // If no payment screenshot found in qr_photos or payment_photos, try to find it in after_photos
                // If we have more photos in after_photos than in bill_photos requirements, 
                // the extra photo(s) might be payment screenshot(s)
                if (afterPhotosExtracted.length > billPhotosFromRequirements.length) {
                  // Find photos that are not in billPhotosFromRequirements - these are likely payment screenshots
                  const potentialPaymentScreenshots = afterPhotosExtracted.filter(url => {
                    const normalizedUrl = normalizeUrl(url);
                    return !billPhotosFromRequirements.some(billUrl => normalizeUrl(billUrl) === normalizedUrl);
                  });
                  
                  // If we found potential payment screenshots, use the first one as payment screenshot
                  // This works for both ONLINE and CASH payments
                  if (potentialPaymentScreenshots.length > 0) {
                    paymentScreenshot = potentialPaymentScreenshots[0];
                    // Remove payment screenshot(s) from bill photos
                    billPhotos = afterPhotosExtracted.filter(url => {
                      const normalizedUrl = normalizeUrl(url);
                      return !potentialPaymentScreenshots.some(ps => normalizeUrl(ps) === normalizedUrl);
                    });
                  } else {
                    // No extra photos found, treat all as bill photos
                    billPhotos = afterPhotosExtracted;
                  }
                } else {
                  // Same count or fewer - all photos are bill photos
                  billPhotos = afterPhotosExtracted;
                }
              }
            } else {
              // Fallback to requirements.bill_photos if after_photos is empty
              billPhotos = billPhotosFromRequirements;
            }
            
            // Final validation: ensure payment screenshot is a valid URL
            if (paymentScreenshot && (!paymentScreenshot.startsWith('http://') && !paymentScreenshot.startsWith('https://'))) {
              console.warn('⚠️ Invalid payment screenshot URL format:', paymentScreenshot);
              paymentScreenshot = null;
            }
            
            // Check for payment_photos in requirements
            const paymentPhotosReq = requirements.find((r: any) => r?.payment_photos);
            const paymentPhotosFromReq = paymentPhotosReq?.payment_photos || [];
            
            const parsedAdminUrl = parseAdminDashboardUrl(location.search);

            return (
              <div
                key={job.id}
                data-admin-job-id={job.id}
                data-completed-job-id={job.id}
                className={
                  highlightJobId === job.id
                    ? 'rounded-xl ring-2 ring-sky-500 ring-offset-2 shadow-md transition-shadow duration-500'
                    : undefined
                }
              >
                <CompletedJobSection
                  job={fullJob}
                  technicians={techniciansForReports.length > 0 ? techniciansForReports : technicians}
                  requirements={requirements}
                  actualCost={actualCost}
                  paymentAmount={paymentAmount}
                  paymentMethod={paymentMethod}
                  qrPhotos={qrPhotos}
                  billPhotos={billPhotos}
                  paymentScreenshot={paymentScreenshot}
                  amcInfo={amcInfo}
                  completionNotes={completionNotes}
                  completedByName={completedByName}
                  reviewRating={reviewRatings[fullJob.id] ?? null}
                  formattedCompletedAt={formattedCompletedAt}
                  setSelectedCompletedJob={a.setSelectedCompletedJob}
                  setCompletedJobEditData={a.setCompletedJobEditData}
                  onEditCompletedReady={() =>
                    a.openAdminModal('edit-completed', { jobId: fullJob.id })
                  }
                  setSelectedJobForMessage={a.setSelectedJobForMessage}
                  onOpenSendMessage={() =>
                    a.openAdminModal('send-message', { jobId: fullJob.id })
                  }
                  onSendCompletionEmail={a.sendCompletionEmailQuick}
                  onEditCompletionEmail={a.openCompletionEmailComposer}
                  setSelectedBillPhotos={a.setSelectedBillPhotos}
                  onGenerateAMCFromJob={
                    amcInfo
                      ? () => {
                          const brandRaw = (fullJob as any).service_brand;
                          const brand =
                            brandRaw === 'elevenro' || brandRaw === 'hydrogenro'
                              ? brandRaw
                              : undefined;
                          a.handleGenerateAMC(customer, {
                            jobId: fullJob.id,
                            amcInfo,
                            serviceBrand: brand,
                          });
                        }
                      : undefined
                  }
                  setSelectedPhoto={a.setSelectedPhoto}
                  onOpenPaymentBillPhotos={(photos, startIdx = 0) => {
                    a.setSelectedBillPhotos(photos);
                    a.setSelectedPhoto({
                      url: photos[startIdx],
                      index: startIdx,
                      total: photos.length,
                    });
                    a.openAdminModal('photo-viewer', {
                      jobId: fullJob.id,
                      photoIdx: startIdx,
                    });
                  }}
                  onOpenJobParts={() =>
                    a.openAdminModal('job-parts', { jobId: fullJob.id })
                  }
                  onJobPartsOpenChange={(open) =>
                    a.onAdminModalOpenChange('job-parts', open)
                  }
                  jobPartsDialogOpen={
                    parsedAdminUrl.modal === 'job-parts' &&
                    parsedAdminUrl.jobId === fullJob.id
                  }
                  onOpenOfficeParts={() =>
                    a.openAdminModal('office-parts', { jobId: fullJob.id })
                  }
                  onOfficePartsOpenChange={(open) =>
                    a.onAdminModalOpenChange('office-parts', open)
                  }
                  officePartsDialogOpen={
                    parsedAdminUrl.modal === 'office-parts' &&
                    parsedAdminUrl.jobId === fullJob.id
                  }
                  onOpenCompletionEmail={() =>
                    a.openAdminModal('completion-email', { jobId: fullJob.id })
                  }
                  onCompletionEmailOpenChange={(open) =>
                    a.onAdminModalOpenChange('completion-email', open)
                  }
                  completionEmailOpen={
                    parsedAdminUrl.modal === 'completion-email' &&
                    parsedAdminUrl.jobId === fullJob.id
                  }
                  minimalMode={minimalCompletedMode}
                  detailsLoaded={detailsLoaded}
                  loadingDetails={isLoadingDetails}
                  onLoadDetails={() => a.loadCompletedJobDetails(job.id)}
                />
                <DeniedJobSection
                  job={job}
                  denialReason={denialReason}
                  deniedBy={deniedBy}
                  formattedDeniedAt={formattedDeniedAt}
                />
                <FollowUpJobSection
                  job={job}
                  formattedFollowUpDate={formattedFollowUpDate}
                  formattedFollowUpTime={formattedFollowUpTime}
                  followUpNotes={followUpNotes}
                  formattedFollowUpScheduledAt={formattedFollowUpScheduledAt}
                  followUpScheduledByName={followUpScheduledByName}
                />
                {(() => {
                  const jobFollowUpDateStr = followUpDateToStr(followUpDate);
                  const isFollowUpToday = statusFilter === 'RESCHEDULED' && ['FOLLOW_UP', 'RESCHEDULED'].includes(job.status) && jobFollowUpDateStr === todayDateStr;
                  const isFollowUpTomorrow = statusFilter === 'RESCHEDULED' && ['FOLLOW_UP', 'RESCHEDULED'].includes(job.status) && jobFollowUpDateStr === tomorrowDateStr;
                  const isAmcDueJob = isOpenAmcServiceJob(job);
                  const jobBorderClass = isAmcDueJob
                    ? 'border-blue-500 border-2'
                    : followUpGlowEnabled && isFollowUpToday
                      ? 'border-red-400 border-2'
                      : followUpGlowEnabled && isFollowUpTomorrow
                        ? 'border-yellow-400 border-2'
                        : job.status === 'PENDING' && !(job.assigned_technician_id || job.assignedTechnicianId)
                          ? 'border-blue-500 border-2'
                          : 'border-gray-300';
                  return (
                <div
                  data-admin-job-id={job.id}
                  className={`bg-white rounded-lg border ${jobBorderClass} hover:border-gray-400 hover:shadow-sm transition-all duration-200 overflow-hidden group${
                    highlightJobId === job.id
                      ? ' ring-2 ring-sky-500 ring-offset-2 shadow-md'
                      : ''
                  }`}
                >
                <div className="p-3 sm:p-4">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1 min-w-0">
                      {/* Mobile: Stack badges vertically, Desktop: Horizontal */}
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge className="bg-blue-100 text-blue-800 border-0">
                            {job.service_type || job.serviceType} {job.service_sub_type || job.serviceSubType}
                          </Badge>
                          <StatusBadge status={job.status} />
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {allPhotos.length > 0 && (
                            <div className="flex items-center gap-1 text-xs text-gray-600 bg-gray-50 px-2 py-1 rounded-md">
                              <Camera className="w-3 h-3" />
                              {allPhotos.length} photos
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 text-sm">
                        <div className="flex items-start gap-2 sm:items-center">
                          <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5 sm:mt-0" />
                          <div className="min-w-0 flex-1">
                            <div className="text-xs text-gray-500">Scheduled</div>
                            <div className="font-medium text-gray-900 break-words">
                              {new Date(job.scheduled_date || job.scheduledDate).toLocaleDateString()}
                            </div>
                            <div className="text-xs text-gray-600">
                              {(() => {
                                // Handle requirements - could be array, object, or string
                                let requirements = (job as any).requirements;
                                
                                // If it's a string, parse it
                                if (typeof requirements === 'string') {
                                  try {
                                    requirements = JSON.parse(requirements);
                                  } catch (e) {
                                    requirements = [];
                                  }
                                }
                                
                                // If it's an object (not array), convert to array
                                if (requirements && typeof requirements === 'object' && !Array.isArray(requirements)) {
                                  requirements = [requirements];
                                }
                                
                                // Ensure it's an array
                                if (!Array.isArray(requirements)) {
                                  requirements = [];
                                }
                                
                                // Check if there's a custom time in requirements
                                const customTime = requirements.find((r: any) => r?.custom_time)?.custom_time;
                                
                                if (customTime && /^\d{1,2}:\d{2}$/.test(String(customTime).trim())) {
                                  // Format the time nicely (e.g., "14:30" -> "2:30 PM")
                                  const [hours, minutes] = String(customTime).trim().split(':');
                                  const hour24 = parseInt(hours, 10);
                                  if (!Number.isNaN(hour24)) {
                                    const hour12 = hour24 > 12 ? hour24 - 12 : (hour24 === 0 ? 12 : hour24);
                                    const ampm = hour24 >= 12 ? 'PM' : 'AM';
                                    return `${hour12}:${minutes} ${ampm}`;
                                  }
                                }
                                // Period label wrongly stored as custom_time (WhatsApp bot legacy)
                                if (customTime && /morning|afternoon|evening|am|pm/i.test(String(customTime))) {
                                  const timeSlot = job.scheduled_time_slot || job.scheduledTimeSlot;
                                  const timeSlotMap: { [key: string]: string } = {
                                    MORNING: 'Morning (9 AM - 12 PM)',
                                    AFTERNOON: 'Afternoon (12 PM - 3 PM)',
                                    EVENING: 'Evening (3 PM - 6 PM)',
                                  };
                                  if (timeSlot && timeSlotMap[timeSlot]) return timeSlotMap[timeSlot];
                                  return String(customTime);
                                }
                                
                                // Check for flexible time
                                const isFlexible = requirements.find((r: any) => r?.flexible_time)?.flexible_time;
                                if (isFlexible) {
                                  return 'Flexible';
                                }
                                
                                // Otherwise show the time slot
                                const timeSlot = job.scheduled_time_slot || job.scheduledTimeSlot || 'Time not specified';
                                // Map time slots to readable format
                                const timeSlotMap: { [key: string]: string } = {
                                  'MORNING': 'Morning (9 AM - 12 PM)',
                                  'AFTERNOON': 'Afternoon (12 PM - 3 PM)',
                                  'EVENING': 'Evening (3 PM - 6 PM)'
                                };
                                return timeSlotMap[timeSlot] || timeSlot;
                              })()}
                            </div>
                          </div>
                        </div>
                        
                        {/* Agreed Price - Only show if it exists and is greater than 0 */}
                        {(() => {
                          // Handle requirements - could be array, object, or string
                          let requirements = (job as any).requirements;
                          
                          // If it's a string, parse it
                          if (typeof requirements === 'string') {
                            try {
                              requirements = JSON.parse(requirements);
                            } catch (e) {
                              requirements = [];
                            }
                          }
                          
                          // If it's an object (not array), convert to array
                          if (requirements && typeof requirements === 'object' && !Array.isArray(requirements)) {
                            requirements = [requirements];
                          }
                          
                          // Ensure it's an array
                          if (!Array.isArray(requirements)) {
                            requirements = [];
                          }
                          
                          const costRange = requirements.find((r: any) => r?.cost_range)?.cost_range;
                          const estimatedCost = (job as any).estimated_cost;
                          const hasCost = estimatedCost && parseFloat(String(estimatedCost)) > 0;
                          
                          if (!hasCost) return null;
                          
                          return (
                            <div className="flex items-start gap-2 sm:items-center">
                              <div className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5 sm:mt-0 font-bold text-lg">₹</div>
                              <div className="min-w-0 flex-1">
                                <div className="text-xs text-gray-500">Agreed Price</div>
                                <div className="font-medium text-gray-900 break-words">
                                  {costRange && typeof costRange === 'string' && costRange.includes('-') 
                                    ? `₹${costRange}` 
                                    : `₹${estimatedCost ? String(estimatedCost) : '0'}`}
                                  {(job as any).actual_cost && String((job as any).actual_cost) !== String(estimatedCost) && (
                                    <span className="text-xs text-gray-500 ml-1">
                                      (Est: ₹{estimatedCost ? String(estimatedCost) : '0'})
                                    </span>
                                  )}
                                </div>
                                {(job as any).actual_cost && parseFloat(String((job as any).actual_cost)) > 0 && (
                                  <div className="text-xs text-green-600">
                                    Final: ₹{String((job as any).actual_cost)}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })()}
                        
                                {(() => {
                          // Get assigned technician info (prefer technicians state so refresh shows latest location)
                          const assignedTechnicianId = (job as any).assigned_technician_id || (job as any).assignedTechnicianId;
                          const assignedTechnician = (assignedTechnicianId ? technicians.find(t => t.id === assignedTechnicianId) : null) || job.assignedTechnician;
                          
                          // Get technician name from various possible fields
                          const technicianName = assignedTechnician?.fullName || 
                            (job as any).technician_name ||
                            (assignedTechnicianId ? technicians.find(t => t.id === assignedTechnicianId)?.fullName : null);
                          
                          // Get brand/model for display (site-aware: no primary/secondary mix)
                          const { brand: validBrand, model: validModel } = resolveJobEquipment(
                            job as unknown as Record<string, unknown>,
                            customer as unknown as Record<string, unknown>
                          );
                          
                          // Show both Equipment and Assigned To if they exist
                          const hasEquipment = Boolean(validBrand || validModel);
                          const hasTechnician = technicianName || assignedTechnicianId;
                          
                          if (!hasEquipment && !hasTechnician) {
                            return null;
                          }
                          
                          return (
                            <>
                              {/* Show Equipment section with brand and/or model */}
                              {hasEquipment && (
                                <div className="flex items-start gap-2 sm:items-center">
                                  <Wrench className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5 sm:mt-0" />
                                  <div className="min-w-0 flex-1">
                                    <div className="text-xs text-gray-500">Equipment</div>
                                    <div className="font-medium text-gray-900 break-words">
                                      {validBrand && validModel 
                                        ? `${validBrand} - ${validModel}` 
                                        : validBrand || validModel}
                              </div>
                            </div>
                          </div>
                        )}
                              
                              {/* Show Assigned To section if technician is assigned */}
                              {hasTechnician && (
                                <div className="flex items-start gap-2 sm:items-center">
                                  <User className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5 sm:mt-0" />
                                  <div className="min-w-0 flex-1">
                                    <div className="text-xs text-gray-500">Assigned To</div>
                                    <div className="font-medium text-gray-900 break-words">
                                      {technicianName || 'Unassigned'}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </>
                          );
                        })()}
                        
                        {job.description && job.description.trim() && job.description !== 'No description provided' && (() => {
                          const descriptionLength = job.description.length;
                          const maxLength = 150; // Show expand option if longer than 150 characters
                          const shouldShowExpand = descriptionLength > maxLength;
                          const displayText = shouldShowExpand 
                            ? job.description.substring(0, maxLength) + '...' 
                            : job.description;
                          
                          return (
                            <div className="flex items-start gap-2 sm:items-center">
                              <FileText className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5 sm:mt-0" />
                              <div className="min-w-0 flex-1">
                                <div className="text-xs text-gray-500">Description</div>
                                <div className="font-medium text-gray-900 break-words">
                                  {displayText}
                                </div>
                                {shouldShowExpand && (
                                  <button
                                    onClick={() => {
                                      a.setSelectedJobDescription({
                                        jobId: job.id || '',
                                        description: job.description
                                      });
                                      a.setDescriptionDialogOpen(true);
                                    }}
                                    className="text-xs text-blue-600 hover:text-blue-800 mt-1 font-medium"
                                  >
                                    Show more
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })()}
                        
                        {/* Lead Source */}
                        {(() => {
                          // Handle requirements - could be array, object, or string
                          let requirements = (job as any).requirements;
                          
                          
                          // If it's a string, parse it
                          if (typeof requirements === 'string') {
                            try {
                              requirements = JSON.parse(requirements);
                            } catch (e) {
                              requirements = [];
                            }
                          }
                          
                          // If it's null or undefined, set to empty array
                          if (!requirements) {
                            requirements = [];
                          }
                          
                          // If it's an object (not array), convert to array
                          if (requirements && typeof requirements === 'object' && !Array.isArray(requirements)) {
                            // Check if it has lead_source directly
                            if (requirements.lead_source) {
                              const ls = requirements.lead_source;
                              const bookedAt = (job as any).created_at || (job as any).createdAt;
                              const isWebsite = ls === 'Website';
                              return (
                                <div className="flex items-start gap-2 sm:items-center">
                                  <Tag className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5 sm:mt-0" />
                                  <div className="min-w-0 flex-1">
                                    <div className="text-xs text-gray-500">Lead Source</div>
                                    <div className="font-medium text-gray-900 break-words">{ls}</div>
                                    {isWebsite && bookedAt && (
                                      <div className="text-xs text-gray-500 mt-0.5">Booked at: {new Date(bookedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}</div>
                                    )}
                                  </div>
                                </div>
                              );
                            }
                            // Otherwise convert to array
                            requirements = [requirements];
                          }
                          
                          // Ensure it's an array
                          if (!Array.isArray(requirements)) {
                            requirements = [];
                          }
                          
                          // Find lead_source in the array
                          let leadSource: string | null = null;
                          
                          // Try to find lead_source in the array
                          for (const req of requirements) {
                            if (req && typeof req === 'object') {
                              if (req.lead_source) {
                                leadSource = req.lead_source;
                                break;
                              }
                            }
                          }
                          
                          // If still no lead_source found, check if requirements array has objects with nested properties
                          if (!leadSource && requirements.length > 0) {
                            // Sometimes Supabase returns it as an array with numeric keys
                            const flatReq = requirements.flat();
                            for (const req of flatReq) {
                              if (req && typeof req === 'object' && req.lead_source) {
                                leadSource = req.lead_source;
                                break;
                              }
                            }
                          }
                          
                          // Fallback to new source-tracking columns when requirements.lead_source is missing
                          const bookingSource = ((job as any).booking_source || '').toString().toLowerCase();
                          const bookingDomain = (job as any).booking_domain || '';
                          if (leadSource === 'Website') {
                            if (bookingSource === 'elevenro') {
                              leadSource = 'Website (ElevenRO)';
                            } else if (bookingSource === 'hydrogenro') {
                              leadSource = 'Website (HydrogenRO)';
                            } else if (bookingDomain) {
                              leadSource = `Website (${bookingDomain})`;
                            }
                          }
                          if (!leadSource) {
                            if (bookingSource === 'elevenro') {
                              leadSource = 'Website (ElevenRO)';
                            } else if (bookingSource === 'hydrogenro') {
                              leadSource = 'Website (HydrogenRO)';
                            } else if (bookingDomain) {
                              leadSource = `Website (${bookingDomain})`;
                            }
                          }

                          const isWebsiteLead =
                            typeof leadSource === 'string' &&
                            leadSource.toLowerCase().includes('website');

                          if (leadSource && !isWebsiteLead) {
                            return (
                              <div className="flex items-start gap-2 sm:items-center">
                                <Tag className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5 sm:mt-0" />
                                <div className="min-w-0 flex-1">
                                  <div className="text-xs text-gray-500">Lead Source</div>
                                  <div className="font-medium text-gray-900 break-words">{leadSource}</div>
                                </div>
                              </div>
                            );
                          }
                          if (isWebsiteLead) {
                            const bookedAt = (job as any).created_at || (job as any).createdAt;
                            if (bookedAt) {
                              const d = new Date(bookedAt);
                              const formatted = d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
                              return (
                                <div className="flex items-start gap-2 sm:items-center">
                                  <Tag className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5 sm:mt-0" />
                                  <div className="min-w-0 flex-1">
                                    <div className="text-xs text-gray-500">Lead Source</div>
                                    <div className="font-medium text-gray-900 break-words">{leadSource}</div>
                                    <div className="text-xs text-gray-500 mt-0.5">Booked at: {formatted}</div>
                                  </div>
                                </div>
                              );
                            }
                          }
                          return null;
                        })()}

                        {/* Service Brand */}
                        {job.status === 'COMPLETED' && (job as any).service_brand && (
                          <div className="flex items-start gap-2 sm:items-center">
                            <Tag className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5 sm:mt-0" />
                            <div className="min-w-0 flex-1">
                              <div className="text-xs text-gray-500">Served As</div>
                              <div className="font-medium text-gray-900 break-words">
                                {(job as any).service_brand === 'elevenro' ? 'ElevenRO' : (job as any).service_brand === 'hydrogenro' ? 'HydrogenRO' : (job as any).service_brand}
                              </div>
                            </div>
                          </div>
                        )}
                        
                      </div>

                      {/* Photos Section - Mobile responsive */}
                      {allPhotos.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-gray-200">
                          <button
                            onClick={() => a.openPhotoGallery(job.id, allPhotos, 'photos')}
                            className="w-full sm:w-auto text-sm text-gray-600 hover:text-gray-800 font-medium flex items-center justify-center sm:justify-start gap-2 bg-gray-50 hover:bg-gray-100 px-3 py-2 rounded-md transition-colors"
                          >
                            <Camera className="w-4 h-4 flex-shrink-0" />
                            <span className="truncate">View Photos ({allPhotos.length})</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Job Actions - Always in top-right */}
                    <div className="flex items-center ml-2 flex-shrink-0">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-8 w-8 p-0 text-gray-400 hover:text-gray-600 flex-shrink-0"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          className="w-48"
                          onCloseAutoFocus={(e) => e.preventDefault()}
                        >
                          {/* Assign to Technician - First option for PENDING status */}
                          {job.status === 'PENDING' && (
                            <DropdownMenuItem onClick={() => a.handleAssignJob(job)}>
                              <Wrench className="mr-2 h-4 w-4" />
                              Assign to Technician
                            </DropdownMenuItem>
                          )}
                          
                          {/* Complete Job - Second option for all active statuses */}
                          {(job.status === 'PENDING' || job.status === 'ASSIGNED' || job.status === 'EN_ROUTE' || job.status === 'IN_PROGRESS' || job.status === 'FOLLOW_UP' || job.status === 'RESCHEDULED') && (
                            <DropdownMenuItem onClick={() => a.handleCompleteJob(job)}>
                              <CheckCircle2 className="mr-2 h-4 w-4" />
                              Complete Job
                            </DropdownMenuItem>
                          )}
                          
                          {job.status === 'ASSIGNED' && (
                            <>
                              <DropdownMenuItem onClick={() => a.handleJobStatusUpdate(job.id, 'IN_PROGRESS')}>
                                <Clock className="mr-2 h-4 w-4" />
                                Start Job
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => a.handleAddTeam(job)}>
                                <UserPlus className="mr-2 h-4 w-4" />
                                Add Team
                              </DropdownMenuItem>
                              {(() => {
                                const currentTeamMembers = (job as any).team_members || [];
                                const teamMembersArray = Array.isArray(currentTeamMembers) ? currentTeamMembers : [];
                                return teamMembersArray.length > 0 ? (
                                  <DropdownMenuItem onClick={() => a.handleRemoveTeam(job)}>
                                    <User className="mr-2 h-4 w-4" />
                                    Remove Team Member
                                  </DropdownMenuItem>
                                ) : null;
                              })()}
                            </>
                          )}
                          {(job.status === 'PENDING' || job.status === 'ASSIGNED' || job.status === 'EN_ROUTE' || job.status === 'IN_PROGRESS') && (
                            <>
                              <DropdownMenuItem onClick={() => a.handleScheduleFollowUp(job)}>
                                <CalendarPlus className="mr-2 h-4 w-4" />
                                Schedule Follow-up
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => a.handleDenyJob(job)}>
                                <XCircle className="mr-2 h-4 w-4" />
                                Deny Job
                              </DropdownMenuItem>
                            </>
                          )}
                          {(job.status === 'FOLLOW_UP' || job.status === 'RESCHEDULED') && (
                            <>
                              <DropdownMenuItem onClick={() => a.handleAssignFromFollowUp(job)}>
                                <Wrench className="mr-2 h-4 w-4" />
                                Assign to Technician
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => a.handleMoveToOngoing(job)}>
                                <ArrowRight className="mr-2 h-4 w-4" />
                                Move to Ongoing
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => a.handleScheduleFollowUp(job)}>
                                <CalendarPlus className="mr-2 h-4 w-4" />
                                Schedule Follow-up
                              </DropdownMenuItem>
                            </>
                          )}
                          <DropdownMenuItem 
                            onClick={() => a.handleEditJob(job)}
                          >
                            <Edit className="mr-2 h-4 w-4" />
                            Edit Job
                          </DropdownMenuItem>
                          {(() => {
                            // Use the same logic as the technician name display above (prefer state for latest location)
                            const assignedTechnicianId = (job as any).assigned_technician_id || (job as any).assignedTechnicianId;
                            const assignedTechnician = (assignedTechnicianId ? technicians.find(t => t.id === assignedTechnicianId) : null) || job.assignedTechnician;
                            
                            // Show reassign option if there's an assigned technician or if status suggests one is assigned
                            const hasAssignedTechnician = 
                              assignedTechnicianId || 
                              assignedTechnician ||
                              job.status === 'ASSIGNED' || 
                              job.status === 'EN_ROUTE' ||
                              job.status === 'IN_PROGRESS';
                            
                            return hasAssignedTechnician ? (
                              <>
                                <DropdownMenuItem 
                                  onClick={() => a.handleReassignJob(job)}
                                >
                                  <User className="mr-2 h-4 w-4" />
                                  Reassign Technician
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onClick={() => a.handleUnassignJob(job)}
                                  className="text-orange-600"
                                >
                                  <X className="mr-2 h-4 w-4" />
                                  Unassign Technician
                                </DropdownMenuItem>
                              </>
                            ) : null;
                          })()}
                          {(() => {
                            // Only show Measure Distance if job is assigned to a technician
                            const assignedTechnicianId = (job as any).assigned_technician_id || (job as any).assignedTechnicianId;
                            
                            return assignedTechnicianId ? (
                              <DropdownMenuItem 
                                onClick={() => a.handleMeasureDistance(job)}
                              >
                                <Navigation className="mr-2 h-4 w-4" />
                                Measure Distance
                              </DropdownMenuItem>
                            ) : null;
                          })()}
                          {(() => {
                            const assignedTechnicianId = (job as any).assigned_technician_id || (job as any).assignedTechnicianId;
                            return assignedTechnicianId ? (
                              <DropdownMenuItem onClick={() => a.handleShareJobWhatsApp(job)}>
                                <MessageSquare className="mr-2 h-4 w-4" />
                                Share job in WhatsApp
                              </DropdownMenuItem>
                            ) : null;
                          })()}
                          {(() => {
                            const assignedTechnicianId = (job as any).assigned_technician_id || (job as any).assignedTechnicianId;
                            if (!assignedTechnicianId) return null;

                            return (
                              <DropdownMenuItem onClick={() => setNudgePickerJob(job)}>
                                <Bell className="mr-2 h-4 w-4" />
                                Nudge tech
                              </DropdownMenuItem>
                            );
                          })()}
                          {(() => {
                            // Ask the assigned technician for the customer's OTP when:
                            // - Home Triangle lead (existing), OR
                            // - the job has Require OTP checked on create/edit.
                            const assignedTechnicianId = (job as any).assigned_technician_id || (job as any).assignedTechnicianId;
                            const leadSource = (getLeadSourceFromJob(job as any) || '').trim().toLowerCase();
                            const isHomeTriangle = leadSource.startsWith('home triangle');
                            const requiresOtp = parseJobRequirements(
                              (job as any).requirements
                            ).some((req: any) => req?.require_otp === true);
                            return assignedTechnicianId && (isHomeTriangle || requiresOtp) ? (
                              <DropdownMenuItem onClick={() => setOtpJob(job)}>
                                <KeyRound className="mr-2 h-4 w-4" />
                                Ask OTP
                              </DropdownMenuItem>
                            ) : null;
                          })()}
                          {(() => {
                            const assignedTechnicianId = (job as any).assigned_technician_id || (job as any).assignedTechnicianId;
                            return assignedTechnicianId ? (
                              <DropdownMenuItem
                                onClick={() => {
                                  a.openAdminModal('share-job-info', { jobId: job.id });
                                }}
                              >
                                <Send className="mr-2 h-4 w-4" />
                                Share info to customer
                              </DropdownMenuItem>
                            ) : null;
                          })()}
                          <DropdownMenuItem
                            onClick={() => {
                              a.openAdminModal('delete-job', { jobId: job.id });
                            }}
                            className="text-red-600"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete Job
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>
              </div>
            ); })()}
              </div>
            );
            });
          })()}
        </div>
      )}
    </div>
  </Card>
);
      })}
      <AskTechnicianOtpDialog
        open={otpJob != null}
        onOpenChange={(o) => {
          if (!o) setOtpJob(null);
        }}
        job={otpJob}
        technicianName={(() => {
          if (!otpJob) return undefined;
          const techId =
            (otpJob as any).assigned_technician_id || (otpJob as any).assignedTechnicianId;
          return technicians.find((t) => t.id === techId)?.fullName;
        })()}
      />
      <JobTechNudgePickerDialog
        open={nudgePickerJob != null}
        onOpenChange={(o) => {
          if (!o) setNudgePickerJob(null);
        }}
        job={nudgePickerJob}
        technicianName={(() => {
          if (!nudgePickerJob) return undefined;
          const techId =
            (nudgePickerJob as any).assigned_technician_id ||
            (nudgePickerJob as any).assignedTechnicianId;
          return technicians.find((t) => t.id === techId)?.fullName;
        })()}
        onCustomMessage={(j) => {
          setNudgePickerJob(null);
          setCustomNudgeJob(j);
        }}
      />
      <JobTechCustomNudgeDialog
        open={customNudgeJob != null}
        onOpenChange={(o) => {
          if (!o) setCustomNudgeJob(null);
        }}
        job={customNudgeJob}
        technicianName={(() => {
          if (!customNudgeJob) return undefined;
          const techId =
            (customNudgeJob as any).assigned_technician_id ||
            (customNudgeJob as any).assignedTechnicianId;
          return technicians.find((t) => t.id === techId)?.fullName;
        })()}
      />
    </>
  );
});
