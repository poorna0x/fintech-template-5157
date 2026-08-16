import type { Dispatch, SetStateAction } from 'react';
import { toast } from 'sonner';
import { supabase, db } from '@/lib/supabase';
import { toDateOnly } from '@/lib/amcAutoJobSchedule';
import type { Job } from '@/types';
import type { AdminStatusFilter } from '@/lib/adminDashboardCache';
import { isLeadSourceAllowCustomText, leadSourceValueForSave } from '@/lib/leadCatalog';
import {
  type PaidTodayMode,
  validatePendingPaymentInputs,
  resolveDbPaymentMethodFromUi,
  resolveJobCustomerPaymentStatus,
  computePendingBalance,
  upsertPendingPaymentInRequirements,
  parseJobPendingPayment,
  markPendingPaymentSettledInRequirements,
  createPendingPaymentReminderFromJob,
  updatePendingPaymentReminderFromJob,
  completePendingPaymentReminder,
} from '@/lib/jobPendingPayment';
import { billPhotosRequirement } from '@/lib/billPhotoCapture';

export type SaveAdminCompletedJobEditParams = {
  selectedCompletedJob: Job | null;
  completedJobEditData: Record<string, any>;
  statusFilter: AdminStatusFilter;
  currentPage: number;
  closeAdminModal: () => void;
  loadFilteredJobs: (filter: AdminStatusFilter, page: number, options?: { silent?: boolean }) => Promise<void>;
  setLoadedCompletedJobDetails: Dispatch<SetStateAction<Record<string, any>>>;
};

export async function saveAdminCompletedJobEdit({
  selectedCompletedJob,
  completedJobEditData,
  statusFilter,
  currentPage,
  closeAdminModal,
  loadFilteredJobs,
  setLoadedCompletedJobDetails,
}: SaveAdminCompletedJobEditParams): Promise<void> {
try {
  if (!selectedCompletedJob) return;

  const pm = completedJobEditData.paymentMethod || 'CASH';
  if (pm === 'PARTIAL') {
    const cashStr = String(completedJobEditData.partialCashAmount ?? '').trim();
    const onlineStr = String(completedJobEditData.partialOnlineAmount ?? '').trim();
    if (!cashStr || !onlineStr) {
      toast.error('Partial payment requires both cash and online amounts.');
      return;
    }
    const pc = parseFloat(cashStr);
    const po = parseFloat(onlineStr);
    if (!Number.isFinite(pc) || !Number.isFinite(po) || pc <= 0 || po <= 0) {
      toast.error('Cash and online amounts must be greater than zero.');
      return;
    }
    const totalShown = parseFloat(String(completedJobEditData.amount ?? '').trim());
    const sum = Math.round((pc + po) * 100) / 100;
    if (!Number.isFinite(totalShown) || Math.abs(totalShown - sum) > 0.02) {
      toast.error('Total amount must equal cash plus online amounts.');
      return;
    }
  } else if (pm === 'PENDING_PAYMENT') {
    const bill = parseFloat(String(completedJobEditData.amount ?? '').trim()) || 0;
    const paidTodayEnabled = Boolean(completedJobEditData.pendingPaidTodayEnabled);
    const paidTodayMode = (completedJobEditData.pendingPaidTodayMode || '') as PaidTodayMode | '';
    const paidTodayAmount =
      paidTodayEnabled && paidTodayMode === 'PARTIAL'
        ? (parseFloat(String(completedJobEditData.partialCashAmount ?? '')) || 0) +
          (parseFloat(String(completedJobEditData.partialOnlineAmount ?? '')) || 0)
        : paidTodayEnabled
          ? parseFloat(String(completedJobEditData.pendingPaidTodayAmount ?? '')) || 0
          : 0;
    const err = validatePendingPaymentInputs({
      billAmount: bill,
      paidTodayEnabled,
      paidTodayMode,
      paidTodayAmount,
      partialCash: parseFloat(String(completedJobEditData.partialCashAmount ?? '')) || 0,
      partialOnline: parseFloat(String(completedJobEditData.partialOnlineAmount ?? '')) || 0,
      promisedDate: String(completedJobEditData.promisedPaymentDate || ''),
    });
    if (err) {
      toast.error(err);
      return;
    }
  } else {
    const amtStr = String(completedJobEditData.amount ?? '').trim();
    if (amtStr === '' || !Number.isFinite(parseFloat(amtStr)) || parseFloat(amtStr) < 0) {
      toast.error('Enter a valid bill amount.');
      return;
    }
  }

  let normalizedAmcInfo: Record<string, any> | null = null;
  if (completedJobEditData.amcInfo) {
    const years = Number(completedJobEditData.amcInfo.years);
    if (!Number.isInteger(years) || years < 1 || years > 10) {
      toast.error('AMC duration must be between 1 and 10 years.');
      return;
    }

    const amountText = String(completedJobEditData.amcInfo.amount ?? '').trim();
    const amount = amountText === '' ? null : Number(amountText);
    if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
      toast.error('Enter a valid AMC amount.');
      return;
    }

    const notes = String(
      completedJobEditData.amcInfo.additional_info ??
      completedJobEditData.amcInfo.notes ??
      ''
    ).trim().slice(0, 2000);

    normalizedAmcInfo = {
      ...completedJobEditData.amcInfo,
      years,
      amount,
      additional_info: notes,
      notes,
      includes_prefilter: Boolean(completedJobEditData.amcInfo.includes_prefilter),
    };
  }

  // Update requirements with edited data
  let requirements: any[] = [];
  try {
    const reqData = (selectedCompletedJob as any).requirements || selectedCompletedJob.requirements;
    if (typeof reqData === 'string') {
      requirements = JSON.parse(reqData);
    } else if (Array.isArray(reqData)) {
      requirements = reqData;
    } else if (reqData && typeof reqData === 'object') {
      requirements = [reqData];
    }
  } catch (e) {
    requirements = [];
  }

  // Update or add AMC info
  const amcIndex = requirements.findIndex((r: any) => r?.amc_info);
  if (normalizedAmcInfo) {
    if (amcIndex >= 0) {
      requirements[amcIndex].amc_info = normalizedAmcInfo;
    } else {
      requirements.push({ amc_info: normalizedAmcInfo });
    }
  }

  // When payment method is CASH, clear qr_photos and any partial amounts
  if (completedJobEditData.paymentMethod === 'CASH') {
    requirements.forEach((r: any) => {
      if (r && typeof r === 'object') {
        if (r.qr_photos) delete r.qr_photos;
        if (r.partial_cash_amount != null) delete r.partial_cash_amount;
        if (r.partial_online_amount != null) delete r.partial_online_amount;
      }
    });
  }

  // Update or add partial amounts when PARTIAL or pending paid-today PARTIAL
  if (
    completedJobEditData.paymentMethod === 'PARTIAL' ||
    (completedJobEditData.paymentMethod === 'PENDING_PAYMENT' &&
      completedJobEditData.pendingPaidTodayEnabled &&
      completedJobEditData.pendingPaidTodayMode === 'PARTIAL')
  ) {
    const cash = parseFloat(completedJobEditData.partialCashAmount) || 0;
    const online = parseFloat(completedJobEditData.partialOnlineAmount) || 0;
    const partialIndex = requirements.findIndex((r: any) => r?.partial_cash_amount != null || r?.partial_online_amount != null);
    if (partialIndex >= 0) {
      requirements[partialIndex].partial_cash_amount = cash;
      requirements[partialIndex].partial_online_amount = online;
    } else {
      requirements.push({ partial_cash_amount: cash, partial_online_amount: online });
    }
  } else if (completedJobEditData.paymentMethod === 'PENDING_PAYMENT') {
    // Clear leftover partial amounts when paid today is not PARTIAL
    requirements.forEach((r: any) => {
      if (r && typeof r === 'object') {
        if (r.partial_cash_amount != null) delete r.partial_cash_amount;
        if (r.partial_online_amount != null) delete r.partial_online_amount;
      }
    });
  }

  // Update QR photos if QR code name changed (only for non-CASH / online / partial / pending online)
  const pendingNeedsQrName =
    completedJobEditData.paymentMethod === 'PENDING_PAYMENT' &&
    completedJobEditData.pendingPaidTodayEnabled &&
    (completedJobEditData.pendingPaidTodayMode === 'ONLINE' ||
      (completedJobEditData.pendingPaidTodayMode === 'PARTIAL' &&
        (parseFloat(String(completedJobEditData.partialOnlineAmount ?? '')) || 0) > 0));
  if (
    completedJobEditData.paymentMethod !== 'CASH' &&
    (completedJobEditData.paymentMethod !== 'PENDING_PAYMENT' || pendingNeedsQrName) &&
    completedJobEditData.qrCodeName
  ) {
    const qrIndex = requirements.findIndex((r: any) => r?.qr_photos);
    if (qrIndex >= 0) {
      requirements[qrIndex].qr_photos = {
        ...requirements[qrIndex].qr_photos,
        selected_qr_code_name: completedJobEditData.qrCodeName
      };
    } else {
      requirements.push({
        qr_photos: { selected_qr_code_name: completedJobEditData.qrCodeName }
      });
    }
  }

  // Update or add lead source
  if (completedJobEditData.leadSource) {
    const leadSourceIndex = requirements.findIndex((r: any) => r?.lead_source);
    const leadSourceValue = leadSourceValueForSave(
      completedJobEditData.leadSource,
      completedJobEditData.leadSourceCustom
    );
    
    if (leadSourceIndex >= 0) {
      requirements[leadSourceIndex].lead_source = leadSourceValue;
      if (
        isLeadSourceAllowCustomText(completedJobEditData.leadSource) &&
        completedJobEditData.leadSourceCustom
      ) {
        requirements[leadSourceIndex].lead_source_custom = completedJobEditData.leadSourceCustom;
      } else {
        delete requirements[leadSourceIndex].lead_source_custom;
      }
    } else {
      const newLeadSource: any = { lead_source: leadSourceValue };
      if (
        isLeadSourceAllowCustomText(completedJobEditData.leadSource) &&
        completedJobEditData.leadSourceCustom
      ) {
        newLeadSource.lead_source_custom = completedJobEditData.leadSourceCustom;
      }
      requirements.push(newLeadSource);
    }
  }

  // Update bill/completion photos (so they show in completed section and reports)
  if (completedJobEditData.billPhotos && Array.isArray(completedJobEditData.billPhotos)) {
    const otherReqs = requirements.filter((r: any) => !r?.bill_photos);
    requirements.length = 0;
    requirements.push(...otherReqs);
    if (completedJobEditData.billPhotos.length > 0) {
      requirements.push(
        billPhotosRequirement(
          completedJobEditData.billPhotos,
          completedJobEditData.billPhotoSources || {}
        )
      );
    }
  }

  // Update payment screenshot(s) in requirements - store all so report shows all (no 1-photo limit)
  const paymentScreenshotsList = Array.isArray(completedJobEditData.paymentScreenshots)
    ? completedJobEditData.paymentScreenshots.filter((u: any) => typeof u === 'string' && (u as string).trim()).map((u: any) => (u as string).trim())
    : [];
  const firstPaymentScreenshot = paymentScreenshotsList.length > 0 ? paymentScreenshotsList[0] : null;

  // Always sync qr_photos.payment_screenshot (including clear when deleted). Techs often
  // store payment here for CASH and ONLINE — skipping CASH left deleted photos visible.
  {
    const qrIndex = requirements.findIndex((r: any) => r?.qr_photos);
    if (firstPaymentScreenshot) {
      if (qrIndex >= 0) {
        requirements[qrIndex] = {
          ...requirements[qrIndex],
          qr_photos: {
            ...(requirements[qrIndex].qr_photos || {}),
            payment_screenshot: firstPaymentScreenshot,
          },
        };
      } else {
        requirements.push({ qr_photos: { payment_screenshot: firstPaymentScreenshot } });
      }
    } else if (qrIndex >= 0) {
      const prevQr = { ...(requirements[qrIndex].qr_photos || {}) };
      delete prevQr.payment_screenshot;
      if (Object.keys(prevQr).length > 0) {
        requirements[qrIndex] = { ...requirements[qrIndex], qr_photos: prevQr };
      } else {
        requirements.splice(qrIndex, 1);
      }
    }
  }

  // Always set payment_photos to full list (for CASH and for report to show multiple payment screenshots)
  const payIdx = requirements.findIndex((r: any) => r?.payment_photos);
  if (paymentScreenshotsList.length > 0) {
    if (payIdx >= 0) {
      requirements[payIdx] = { payment_photos: paymentScreenshotsList };
    } else {
      requirements.push({ payment_photos: paymentScreenshotsList });
    }
  } else if (payIdx >= 0) {
    requirements.splice(payIdx, 1);
  }

  // Prepare update data
  let amount = parseFloat(completedJobEditData.amount) || 0;
  if (completedJobEditData.paymentMethod === 'PARTIAL') {
    const cash = parseFloat(completedJobEditData.partialCashAmount) || 0;
    const online = parseFloat(completedJobEditData.partialOnlineAmount) || 0;
    amount = cash + online;
  }
  const leadCost = parseFloat(completedJobEditData.leadCost) || 0;
  
  // Handle completion date
  let completedAt = null;
  if (completedJobEditData.completedAt) {
    // Use the ISO string if it's already set
    completedAt = completedJobEditData.completedAt;
  } else if (completedJobEditData.completedDate && completedJobEditData.completedTime) {
    // Combine date and time if provided separately
    const combinedDateTime = new Date(`${completedJobEditData.completedDate}T${completedJobEditData.completedTime}`);
    completedAt = combinedDateTime.toISOString();
  } else if (completedJobEditData.completedDate) {
    // If only date is provided, use noon of that date
    const dateOnly = new Date(`${completedJobEditData.completedDate}T12:00:00`);
    completedAt = dateOnly.toISOString();
  }
  
  // If completed_by is changed to a technician, also update assigned_technician_id.
  // "office" (and legacy "admin") means no technician — completed_by is a uuid
  // column, so we store null and tag requirements with completed_by_office instead.
  const rawCompletedBy = completedJobEditData.completedBy || 'office';
  const isOfficeCompletion = rawCompletedBy === 'office' || rawCompletedBy === 'admin' || rawCompletedBy === 'Admin';
  const oldAssignedTechnicianId = (selectedCompletedJob as any).assigned_technician_id;

  // Tag/untag office completion in requirements
  const reqsWithoutOfficeFlag = requirements.filter((r: any) => !r?.completed_by_office);
  requirements.length = 0;
  requirements.push(...reqsWithoutOfficeFlag);
  if (isOfficeCompletion) {
    requirements.push({ completed_by_office: true });
  }

  // Tag/untag "hide spare parts from technician top-up" (all + per-item)
  const reqsWithoutHidePartsFlag = requirements.filter(
    (r: any) => !r?.hide_parts_from_topup && !r?.topup_hidden_inventory_ids
  );
  requirements.length = 0;
  requirements.push(...reqsWithoutHidePartsFlag);
  if (completedJobEditData.hidePartsFromTopup) {
    requirements.push({ hide_parts_from_topup: true });
  } else if (
    Array.isArray(completedJobEditData.topupHiddenInventoryIds) &&
    completedJobEditData.topupHiddenInventoryIds.length > 0
  ) {
    // Per-item hide only applies when not hiding all.
    requirements.push({
      topup_hidden_inventory_ids: completedJobEditData.topupHiddenInventoryIds.map((id: any) => String(id)),
    });
  }

  // UI: CASH | ONLINE | PARTIAL | PENDING_PAYMENT → DB payment_method
  const uiPaymentMethod = completedJobEditData.paymentMethod || 'CASH';
  const existingPending = parseJobPendingPayment(requirements);
  const previousReminderId = existingPending?.reminder_id || null;

  let paidTodayForPending = 0;
  let jobsPaymentMethod: 'CASH' | 'UPI' | 'PARTIAL' | null = 'CASH';
  let paymentStatus: 'PENDING' | 'PARTIAL' | 'PAID' =
    amount > 0 ? 'PAID' : 'PENDING';

  if (uiPaymentMethod === 'PENDING_PAYMENT') {
    const paidTodayEnabled = Boolean(completedJobEditData.pendingPaidTodayEnabled);
    const paidTodayMode = (completedJobEditData.pendingPaidTodayMode || '') as PaidTodayMode | '';
    paidTodayForPending =
      paidTodayEnabled && paidTodayMode === 'PARTIAL'
        ? (parseFloat(String(completedJobEditData.partialCashAmount ?? '')) || 0) +
          (parseFloat(String(completedJobEditData.partialOnlineAmount ?? '')) || 0)
        : paidTodayEnabled
          ? parseFloat(String(completedJobEditData.pendingPaidTodayAmount ?? '')) || 0
          : 0;
    jobsPaymentMethod = resolveDbPaymentMethodFromUi(
      'PENDING_PAYMENT',
      paidTodayMode || null,
      paidTodayForPending
    );
    paymentStatus = resolveJobCustomerPaymentStatus({
      billAmount: amount,
      mode: 'PENDING_PAYMENT',
      paidTodayAmount: paidTodayForPending,
    });

    const balance = computePendingBalance(amount, paidTodayForPending);
    const promisedDate = String(completedJobEditData.promisedPaymentDate || '');
    const customerId =
      (selectedCompletedJob as any).customer?.id ??
      (selectedCompletedJob as any).customer_id ??
      (selectedCompletedJob as Job).customerId;

    let reminderId: string | null = previousReminderId;
    if (customerId && balance > 0) {
      if (previousReminderId) {
        const { error: remErr } = await updatePendingPaymentReminderFromJob({
          reminderId: previousReminderId,
          amountPending: balance,
          promisedDate,
          jobId: selectedCompletedJob.id,
          jobNumber:
            (selectedCompletedJob as any).job_number ||
            (selectedCompletedJob as Job).jobNumber,
        });
        if (remErr) {
          console.error('[pending-payment] reminder update failed', remErr);
          toast.warning('Job will save, but pending payment reminder update failed.');
        }
      } else {
        const { id, error: remErr } = await createPendingPaymentReminderFromJob({
          customerId: String(customerId),
          jobId: selectedCompletedJob.id,
          jobNumber:
            (selectedCompletedJob as any).job_number ||
            (selectedCompletedJob as Job).jobNumber,
          amountPending: balance,
          promisedDate,
        });
        if (remErr) {
          console.error('[pending-payment] reminder create failed', remErr);
          toast.warning('Job will save, but pending payment reminder failed — add it in Settings.');
        } else {
          reminderId = id;
        }
      }
    }

    requirements = upsertPendingPaymentInRequirements(requirements, {
      promised_date: promisedDate,
      amount_pending: balance,
      paid_today: paidTodayForPending,
      paid_today_mode: paidTodayEnabled
        ? (paidTodayMode as PaidTodayMode) || null
        : null,
      reminder_id: reminderId,
      settled_at: null,
    });
  } else {
    jobsPaymentMethod =
      uiPaymentMethod === 'ONLINE'
        ? 'UPI'
        : uiPaymentMethod === 'PARTIAL'
          ? 'PARTIAL'
          : 'CASH';
    paymentStatus = resolveJobCustomerPaymentStatus({
      billAmount: amount,
      mode: uiPaymentMethod as any,
    });

    // Switching away from open pending → complete reminder + mark settled
    if (existingPending && !existingPending.settled_at) {
      if (existingPending.reminder_id) {
        const { error: remErr } = await completePendingPaymentReminder(existingPending.reminder_id);
        if (remErr) {
          console.error('[pending-payment] reminder complete failed', remErr);
          toast.warning('Job saved, but linked pending payment reminder was not marked complete.');
        }
      }
      requirements = markPendingPaymentSettledInRequirements(requirements);
    } else if (!existingPending) {
      // Ensure no stale pending_payment entry remains when never pending
      requirements = upsertPendingPaymentInRequirements(requirements, null);
    }
  }
  
  const updateData: any = {
    actual_cost: amount,
    payment_amount: amount,
    payment_method: jobsPaymentMethod,
    payment_status: paymentStatus,
    completion_notes: completedJobEditData.completionNotes || '',
    completed_by: isOfficeCompletion ? null : rawCompletedBy,
    lead_cost: leadCost,
    requirements: JSON.stringify(requirements),
    service_brand:
      completedJobEditData.serviceBrand === 'elevenro'
        ? 'elevenro'
        : 'hydrogenro'
  };
  const paymentScreenshotsUrls = Array.isArray(completedJobEditData.paymentScreenshots)
    ? completedJobEditData.paymentScreenshots.filter((u: any) => typeof u === 'string' && u.trim())
    : [];
  const billPhotosList = Array.isArray(completedJobEditData.billPhotos)
    ? completedJobEditData.billPhotos
    : [];
  // Always rewrite after_photos from the edit lists — otherwise deleting the last
  // payment screenshot left the old URL in after_photos and the UI still showed it.
  if (
    Array.isArray(completedJobEditData.paymentScreenshots) ||
    Array.isArray(completedJobEditData.billPhotos)
  ) {
    updateData.after_photos = [...paymentScreenshotsUrls, ...billPhotosList].filter(Boolean);
  }
  
  // If completed_by is a technician ID, update assigned_technician_id so salary,
  // payment, and attendance records link to the correct technician. Office
  // completions clear the technician so no one is credited in analytics/payments.
  if (!isOfficeCompletion) {
    updateData.assigned_technician_id = rawCompletedBy;
  } else {
    updateData.assigned_technician_id = null;
  }
  
  // Only update completed_at and end_time if it's been explicitly set/changed
  // IMPORTANT: Both fields are used for salary calculations:
  // - completed_at: General completion timestamp
  // - end_time: Used by TechnicianPayments component to filter jobs by month for salary calculations
  // Updating both ensures the job appears in the correct month's salary when completion date is changed
  if (completedAt) {
    updateData.completed_at = completedAt;
    updateData.end_time = completedAt; // Update end_time so salary calculations use the new date
  }

  const { error } = await db.jobs.update(selectedCompletedJob.id, updateData);
  
  if (error) {
    toast.error('Failed to update job: ' + error.message);
  } else {
    // "Hide from top-up" inventory correction: a part hidden from top-up is treated
    // as taken directly from MAIN, so move it main → tech (subtract main, add tech).
    // Un-hiding reverses it. Diff is taken against the job's previously-saved hide
    // flags so it applies only to what actually changed in this save.
    try {
      const parseReqs = (raw: any): any[] => {
        if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return []; } }
        if (Array.isArray(raw)) return raw;
        if (raw && typeof raw === 'object') return [raw];
        return [];
      };
      const oldReqs = parseReqs((selectedCompletedJob as any).requirements);
      const oldHideAll = oldReqs.some((r: any) => r?.hide_parts_from_topup === true);
      const oldPerItemEntry = oldReqs.find((r: any) => Array.isArray(r?.topup_hidden_inventory_ids));
      const oldPerItem = new Set<string>(
        oldPerItemEntry ? oldPerItemEntry.topup_hidden_inventory_ids.map((x: any) => String(x)) : []
      );
      const newHideAll = !!completedJobEditData.hidePartsFromTopup;
      const newPerItem = new Set<string>(
        Array.isArray(completedJobEditData.topupHiddenInventoryIds)
          ? completedJobEditData.topupHiddenInventoryIds.map((x: any) => String(x))
          : []
      );

      // Skip the parts fetch entirely unless the hide settings actually changed.
      const perItemSame =
        oldPerItem.size === newPerItem.size &&
        Array.from(newPerItem).every((id) => oldPerItem.has(id));
      const hideChanged = oldHideAll !== newHideAll || (!oldHideAll && !newHideAll && !perItemSame);

      if (hideChanged) {
        const { data: jpRows } = await db.jobPartsUsed.getByJob(selectedCompletedJob.id);
        const rows = (jpRows || []) as any[];
        if (rows.length > 0) {
          const qtyByInv = new Map<string, number>();
          const techByInv = new Map<string, string>();
          rows.forEach((r) => {
            // Skip custom one-off parts: they have no inventory_id and aren't tracked in stock.
            if (!r.inventory_id) return;
            const inv = String(r.inventory_id);
            qtyByInv.set(inv, (qtyByInv.get(inv) || 0) + (Number(r.quantity_used) || 0));
            if (r.technician_id && !techByInv.has(inv)) techByInv.set(inv, String(r.technician_id));
          });
          const allInvIds = Array.from(qtyByInv.keys());

          const oldHidden = new Set<string>(oldHideAll ? allInvIds : Array.from(oldPerItem));
          const newHidden = new Set<string>(newHideAll ? allInvIds : Array.from(newPerItem));

          const newlyHidden = allInvIds.filter((id) => newHidden.has(id) && !oldHidden.has(id));
          const newlyUnhidden = allInvIds.filter((id) => !newHidden.has(id) && oldHidden.has(id));
          const moveFailures: string[] = [];

          // Newly hidden → subtract main, add tech (atomic via top-up RPC).
          for (const inv of newlyHidden) {
            const qty = qtyByInv.get(inv) || 0;
            const techId = techByInv.get(inv);
            if (qty <= 0 || !techId) continue;
            const { error: e } = await db.technicianInventory.topUpFromMain(inv, qty, techId);
            if (e) moveFailures.push((e as any).message || 'move failed');
          }

          // Newly un-hidden → reverse: subtract tech, add main. Cache each
          // technician's inventory so we fetch it at most once (parts usually share one tech).
          const techInvCache = new Map<string, any[]>();
          for (const inv of newlyUnhidden) {
            const qty = qtyByInv.get(inv) || 0;
            const techId = techByInv.get(inv);
            if (qty <= 0 || !techId) continue;
            let techRows = techInvCache.get(techId);
            if (!techRows) {
              const { data } = await db.technicianInventory.getByTechnician(techId);
              techRows = (data || []) as any[];
              techInvCache.set(techId, techRows);
            }
            const techRow = techRows.find((t: any) => String(t.inventory_id) === inv);
            if (!techRow || Number(techRow.quantity) < qty) {
              moveFailures.push('Not enough technician stock to reverse a part');
              continue;
            }
            const nextQty = Number(techRow.quantity) - qty;
            const { error: te } = await db.technicianInventory.update(techRow.id, {
              quantity: nextQty,
            });
            if (te) { moveFailures.push((te as any).message || 'reverse failed'); continue; }
            techRow.quantity = nextQty; // keep cache consistent for repeat items
            const { error: me } = await db.inventory.incrementForJob(inv, qty);
            if (me) moveFailures.push((me as any).message || 'reverse main failed');
          }

          if (moveFailures.length > 0) {
            toast.warning(`Some stock moves failed: ${moveFailures.slice(0, 2).join('; ')}`);
          } else if (newlyHidden.length > 0 || newlyUnhidden.length > 0) {
            toast.success('Hidden parts moved from main to technician stock.');
          }
        }
      }
    } catch (invErr: any) {
      console.error('Top-up hide inventory move failed:', invErr);
      toast.warning('Job saved, but stock move for hidden parts failed.');
    }

    // Office completion: remove any technician payment/commission for this job so
    // the previously-assigned technician is no longer credited.
    if (isOfficeCompletion && oldAssignedTechnicianId) {
      try {
        await supabase
          .from('technician_payments')
          .delete()
          .eq('job_id', selectedCompletedJob.id);
      } catch (e) {
        console.error('Error removing technician payment for office completion:', e);
      }
    }

    // Handle technician_payments updates when completed_by or assigned_technician_id changes
    const newTechnicianId = isOfficeCompletion ? null : (updateData.assigned_technician_id || oldAssignedTechnicianId);
    const technicianChanged = newTechnicianId !== oldAssignedTechnicianId;
    
    // Update technician_payments if job has an assigned technician or if technician changed
    if (newTechnicianId && (amount > 0 || technicianChanged)) {
      try {
        // Check if technician_payment record exists
        const { data: existingPayment, error: paymentCheckError } = await supabase
          .from('technician_payments')
          .select('id, technician_id, commission_percentage')
          .eq('job_id', selectedCompletedJob.id)
          .single();

        if (paymentCheckError && paymentCheckError.code !== 'PGRST116') {
          // Error other than "not found" - log but don't fail
          console.error('Error checking payment record:', paymentCheckError);
        } else if (existingPayment) {
          // Update existing payment record
          const commissionPercentage = existingPayment.commission_percentage || 10;
          const newCommissionAmount = amount * (commissionPercentage / 100);
          
          const updatePaymentData: any = {
            bill_amount: Math.round(amount * 100) / 100,
            commission_amount: Math.round(newCommissionAmount * 100) / 100,
            updated_at: new Date().toISOString()
          };
          
          // If technician changed, update technician_id in payment record
          // This ensures salary, commission, and attendance are attributed to the new technician
          if (technicianChanged) {
            updatePaymentData.technician_id = newTechnicianId;
          }
          
          const { error: paymentUpdateError } = await supabase
            .from('technician_payments')
            .update(updatePaymentData)
            .eq('id', existingPayment.id);

          if (paymentUpdateError) {
            console.error('Error updating payment record:', paymentUpdateError);
            toast.warning('Job updated but payment record update failed');
          } else if (technicianChanged) {
            toast.success('Job, technician assignment, and payment records updated successfully');
          }
        } else {
          // Create new payment record if job is completed and has technician
          if ((selectedCompletedJob as any).status === 'COMPLETED' && newTechnicianId) {
            const commissionPercentage = 10; // Default 10%
            const commissionAmount = amount * (commissionPercentage / 100);
            
            const { error: paymentCreateError } = await supabase
              .from('technician_payments')
              .insert({
                technician_id: newTechnicianId,
                job_id: selectedCompletedJob.id,
                bill_amount: Math.round(amount * 100) / 100,
                commission_percentage: commissionPercentage,
                commission_amount: Math.round(commissionAmount * 100) / 100,
                payment_status: 'PENDING'
              });

            if (paymentCreateError) {
              console.error('Error creating payment record:', paymentCreateError);
              toast.warning('Job updated but payment record creation failed');
            } else if (technicianChanged) {
              toast.success('Job, technician assignment, and payment records updated successfully');
            }
          }
        }
      } catch (paymentError: any) {
        console.error('Error updating technician payments:', paymentError);
        // Don't fail the whole operation, just log the error
      }
    } else if (technicianChanged && newTechnicianId) {
      // Even if amount is 0, if technician changed, update payment record technician_id
      // This ensures attendance records are correctly attributed
      try {
        const { data: existingPayment, error: paymentCheckError } = await supabase
          .from('technician_payments')
          .select('id, technician_id')
          .eq('job_id', selectedCompletedJob.id)
          .single();

        if (existingPayment) {
          // Update technician_id even if amount is 0
          const { error: paymentUpdateError } = await supabase
            .from('technician_payments')
            .update({
              technician_id: newTechnicianId,
              updated_at: new Date().toISOString()
            })
            .eq('id', existingPayment.id);

          if (paymentUpdateError) {
            console.error('Error updating payment record technician:', paymentUpdateError);
          } else {
            toast.success('Job and technician assignment updated successfully');
          }
        }
      } catch (paymentError: any) {
        console.error('Error updating technician payment:', paymentError);
      }
    }
    
    if (!technicianChanged) {
      toast.success('Job updated successfully');
    }

    if (completedJobEditData.amcInfo) {
      const customerId =
        (selectedCompletedJob as any).customer?.id ??
        (selectedCompletedJob as any).customer_id ??
        (selectedCompletedJob as Job).customerId;
      if (customerId) {
        try {
          const { data: activeAmc } = await db.amcContracts.getActiveByCustomerId(
            String(customerId)
          );
          if (activeAmc?.id) {
            const info = completedJobEditData.amcInfo;
            const amcPatch: {
              start_date?: string;
              end_date?: string;
              years?: number;
              includes_prefilter?: boolean;
              service_period_months?: number;
            } = {};
            const startDate = toDateOnly(info.date_given);
            const endDate = toDateOnly(info.end_date);
            if (startDate) amcPatch.start_date = startDate;
            if (endDate) amcPatch.end_date = endDate;
            if (info.years != null) amcPatch.years = Number(info.years) || 1;
            if (info.includes_prefilter !== undefined) {
              amcPatch.includes_prefilter = Boolean(info.includes_prefilter);
            }
            if (
              info.service_period_months !== undefined &&
              info.service_period_months !== null
            ) {
              amcPatch.service_period_months = Number(info.service_period_months);
            }
            if (Object.keys(amcPatch).length > 0) {
              const { error: amcErr } = await db.amcContracts.update(
                activeAmc.id,
                amcPatch
              );
              if (amcErr) {
                toast.warning('Job saved but AMC contract update failed');
              }
            }
          }
        } catch (amcSyncErr) {
          console.error('AMC contract sync failed:', amcSyncErr);
        }
      }
    }

    closeAdminModal();
    // Reload jobs
    await loadFilteredJobs(statusFilter, currentPage);
    // Drop stale full-job cache so profit/amounts match DB (list row is fresh after reload).
    const updatedId = selectedCompletedJob.id;
    setLoadedCompletedJobDetails((prev) => {
      if (!prev[updatedId]) return prev;
      const next = { ...prev };
      delete next[updatedId];
      return next;
    });
  }
} catch (error: any) {
  toast.error('Error updating job: ' + error.message);
}
}
