import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { Job } from '@/types';
import {
  notifyTechnicianJobWhatsApp,
  type TechLikeForWhatsApp,
} from '@/lib/jobTechnicianWhatsApp';

export type OpenAdminWhatsappForJobCtx = {
  scrollPositionBeforeWhatsAppRef: MutableRefObject<number>;
  setWhatsappTechnician: Dispatch<SetStateAction<{ name: string; phone: string } | null>>;
  setWhatsappServiceSubType: Dispatch<SetStateAction<string>>;
  setWhatsappCustomerName: Dispatch<SetStateAction<string>>;
  setWhatsappLocation: Dispatch<SetStateAction<string>>;
  setWhatsappLeadSource: Dispatch<SetStateAction<string>>;
  setWhatsappCustomTime: Dispatch<SetStateAction<string>>;
  setWhatsappDescription: Dispatch<SetStateAction<string>>;
  setWhatsappAgreedCost: Dispatch<SetStateAction<string>>;
  setWhatsappDialogOpen: Dispatch<SetStateAction<boolean>>;
  openAdminWhatsappModal: () => void;
};

/**
 * Assign/reassign WhatsApp to technician.
 * @returns 'dialog' if manual Send UI opened; 'auto' if sent; 'skipped' otherwise.
 */
export async function openAdminWhatsappForJobAssign(
  ctx: OpenAdminWhatsappForJobCtx,
  job: Job,
  technician: TechLikeForWhatsApp,
  scrollY: number
): Promise<'dialog' | 'auto' | 'skipped'> {
  return notifyTechnicianJobWhatsApp({
    job,
    technician,
    mode: 'assign',
    scrollY,
    ctx,
  });
}

/** Unassign WhatsApp to technician. */
export async function openAdminWhatsappForJobUnassign(
  ctx: OpenAdminWhatsappForJobCtx,
  job: Job,
  technician: TechLikeForWhatsApp,
  scrollY: number
): Promise<'dialog' | 'auto' | 'skipped'> {
  return notifyTechnicianJobWhatsApp({
    job,
    technician,
    mode: 'unassign',
    scrollY,
    ctx,
  });
}
