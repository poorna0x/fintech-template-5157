/**
 * Client facade for the full-admin CRM AI chat.
 * Read-only suggestions; mutations only via existing CRM dialogs after confirm.
 */
import { resolveSupabaseAccessTokenForApi } from '@/lib/ensureSupabaseSession';

export type AiCrmActionType =
  | 'open_customer'
  | 'create_job'
  | 'schedule_follow_up'
  | 'create_reminder';

export type AiCrmCustomerEntity = {
  id: string;
  customerCode?: string | null;
  name: string;
  phone?: string | null;
  alternatePhone?: string | null;
  email?: string | null;
  serviceType?: string | null;
  brand?: string | null;
  model?: string | null;
  lastServiceDate?: string | null;
  tier?: string | null;
  status?: string | null;
  confirmedPaidTotal?: number | null;
  billedTotal?: number | null;
  fullyPaidJobs?: number | null;
  completedJobs?: number | null;
};

export type AiCrmJobEntity = {
  id: string;
  jobNumber?: string | null;
  customerId?: string | null;
  status?: string | null;
  serviceType?: string | null;
  serviceSubType?: string | null;
  paymentAmount?: number | null;
  actualCost?: number | null;
  paymentMethod?: string | null;
  completedAt?: string | null;
  scheduledDate?: string | null;
};

export type AiCrmReminderEntity = {
  id: string;
  entityType?: string | null;
  entityId?: string | null;
  title: string;
  reminderAt?: string | null;
  completedAt?: string | null;
  notePreview?: string | null;
};

export type AiCrmPaymentEntity = {
  reminderId: string;
  customerId?: string | null;
  amountPending: number;
  dueAt?: string | null;
  jobNumber?: string | null;
  jobId?: string | null;
};

export type AiCrmDocumentEntity = {
  kind: string;
  id: string;
  customerId?: string | null;
  label: string;
  startDate?: string | null;
  endDate?: string | null;
  status?: string | null;
  invoiceDate?: string | null;
  grandTotal?: number | null;
  documentType?: string | null;
  verifyCode?: string | null;
  createdAt?: string | null;
};

export type AiCrmCreateJobDraft = {
  customerId: string;
  serviceType?: 'RO' | 'SOFTENER';
  serviceSubType?: string;
  scheduledDate?: string | null;
  scheduledTimeSlot?: string | null;
  scheduledTimeCustom?: string | null;
  description?: string;
  priority?: string;
  leadSource?: string;
  notes?: string;
};

export type AiCrmFollowUpDraft = {
  jobId: string;
  followUpDate?: string | null;
  followUpTime?: string | null;
  followUpReason?: string;
  addAmcReminder?: boolean;
};

export type AiCrmReminderDraft = {
  customerId?: string | null;
  title: string;
  notes?: string;
  reminderAt?: string | null;
};

export type AiCrmProposedAction = {
  type: AiCrmActionType;
  label: string;
  confidence: number;
  requiresConfirm: true;
  payload:
    | { customerId: string }
    | AiCrmCreateJobDraft
    | AiCrmFollowUpDraft
    | AiCrmReminderDraft;
};

export type AiCrmChatResult =
  | {
      ok: true;
      answer: string;
      confidence: number;
      requiresHuman: boolean;
      warnings: string[];
      entities: {
        customers: AiCrmCustomerEntity[];
        jobs: AiCrmJobEntity[];
        reminders: AiCrmReminderEntity[];
        payments: AiCrmPaymentEntity[];
        documents: AiCrmDocumentEntity[];
      };
      proposedActions: AiCrmProposedAction[];
      meta: {
        provider?: string;
        model?: string;
        latencyMs?: number;
        canMutate: false;
        canCreateJob: false;
        canDelete: false;
        canAutoSend: false;
      };
    }
  | { ok: false; error: string };

export async function requestAiCrmChat(opts: {
  message: string;
  focusCustomerId?: string | null;
  conversationId?: string | null;
}): Promise<AiCrmChatResult> {
  const message = String(opts.message || '').trim();
  if (message.length < 2) return { ok: false, error: 'Enter a search or request' };

  const accessToken = await resolveSupabaseAccessTokenForApi();
  if (!accessToken) return { ok: false, error: 'Not signed in' };

  try {
    const res = await fetch('/.netlify/functions/ai-crm-chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        message,
        ...(opts.focusCustomerId ? { focusCustomerId: opts.focusCustomerId } : {}),
        ...(opts.conversationId ? { conversationId: opts.conversationId } : {}),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) {
      return {
        ok: false,
        error: String(data?.error || `AI request failed (${res.status})`),
      };
    }

    const proposedActions = Array.isArray(data.proposedActions)
      ? data.proposedActions
          .filter((row: any) => row && typeof row === 'object' && row.requiresConfirm !== false)
          .map((row: any) => ({
            ...row,
            requiresConfirm: true as const,
          }))
      : [];

    return {
      ok: true,
      answer: String(data.answer || ''),
      confidence: Number(data.confidence) || 0.5,
      requiresHuman: data.requiresHuman === true,
      warnings: Array.isArray(data.warnings) ? data.warnings.map(String) : [],
      entities: {
        customers: Array.isArray(data.entities?.customers) ? data.entities.customers : [],
        jobs: Array.isArray(data.entities?.jobs) ? data.entities.jobs : [],
        reminders: Array.isArray(data.entities?.reminders) ? data.entities.reminders : [],
        payments: Array.isArray(data.entities?.payments) ? data.entities.payments : [],
        documents: Array.isArray(data.entities?.documents) ? data.entities.documents : [],
      },
      proposedActions,
      meta: {
        provider: data?.meta?.provider,
        model: data?.meta?.model,
        latencyMs: data?.meta?.latencyMs,
        canMutate: false,
        canCreateJob: false,
        canDelete: false,
        canAutoSend: false,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'AI request failed',
    };
  }
}
