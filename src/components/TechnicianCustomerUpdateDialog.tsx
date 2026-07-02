import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/supabase';
import { ensureSupabaseSessionForWrite } from '@/lib/ensureSupabaseSession';
import { canTechnicianEditCustomerForJob } from '@/lib/technicianCustomerUpdate';
import type { Job } from '@/types';

export type TechnicianCustomerUpdatePatch = {
  email?: string;
  alternate_phone?: string;
};

interface TechnicianCustomerUpdateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: Job | null;
  onSaved?: (customerId: string, patch: TechnicianCustomerUpdatePatch) => void;
}

function readEmbeddedCustomerId(job: Job | null): string | null {
  if (!job) return null;
  const embedded = job.customer as Record<string, unknown> | undefined;
  return (
    (embedded?.id as string | undefined) ||
    job.customer_id ||
    (job as { customerId?: string }).customerId ||
    null
  );
}

const TechnicianCustomerUpdateDialog: React.FC<TechnicianCustomerUpdateDialogProps> = ({
  open,
  onOpenChange,
  job,
  onSaved,
}) => {
  const jobSnapshotRef = useRef<Job | null>(null);
  const loadedSessionRef = useRef<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [customerId, setCustomerId] = useState('');
  const [fullName, setFullName] = useState('');
  const [primaryPhone, setPrimaryPhone] = useState('');
  const [email, setEmail] = useState('');
  const [alternatePhone, setAlternatePhone] = useState('');

  const [initialEmail, setInitialEmail] = useState('');
  const [initialAlternatePhone, setInitialAlternatePhone] = useState('');

  const activeJob = jobSnapshotRef.current ?? job;
  const jobId = activeJob?.id;

  const jobNumber = useMemo(
    () => String(activeJob?.job_number || activeJob?.jobNumber || ''),
    [activeJob]
  );

  const jobAllowed = useMemo(() => canTechnicianEditCustomerForJob(activeJob), [activeJob]);

  const assertJobAllowed = (): boolean => {
    if (!jobId || !jobAllowed) {
      toast.error('Customer details can only be updated for your active assigned jobs');
      return false;
    }
    return true;
  };

  const resetForm = useCallback(() => {
    setCustomerId('');
    setFullName('');
    setPrimaryPhone('');
    setEmail('');
    setAlternatePhone('');
    setInitialEmail('');
    setInitialAlternatePhone('');
    setLoading(false);
    setSaving(false);
  }, []);

  const hydrateFromRow = useCallback((row: Record<string, unknown>) => {
    setCustomerId(String(row.id));
    setFullName(String(row.full_name || row.fullName || 'Customer'));
    setPrimaryPhone(String(row.phone || ''));
    const nextEmail = String(row.email || '');
    const nextAlternate = String(row.alternate_phone || row.alternatePhone || '');
    setEmail(nextEmail);
    setAlternatePhone(nextAlternate);
    setInitialEmail(nextEmail);
    setInitialAlternatePhone(nextAlternate);
  }, []);

  useEffect(() => {
    if (open && job) {
      jobSnapshotRef.current = job;
    }
    if (!open) {
      jobSnapshotRef.current = null;
      loadedSessionRef.current = null;
      resetForm();
    }
  }, [open, job, resetForm]);

  useEffect(() => {
    if (!open || !jobId) return;

    const sessionKey = jobId;
    if (loadedSessionRef.current === sessionKey) return;
    loadedSessionRef.current = sessionKey;

    const snapshot = jobSnapshotRef.current ?? job;
    const embedded = snapshot?.customer as Record<string, unknown> | undefined;
    const id = readEmbeddedCustomerId(snapshot);

    if (!id) {
      toast.error('Customer not found for this job');
      onOpenChange(false);
      return;
    }

    if (embedded) {
      hydrateFromRow({
        id,
        full_name: embedded.full_name || embedded.fullName,
        phone: embedded.phone,
        email: embedded.email,
        alternate_phone: embedded.alternate_phone || embedded.alternatePhone,
      });
    } else {
      setLoading(true);
    }

    let cancelled = false;

    void (async () => {
      const { data, error } = await db.customers.getByIdForTechnicianUpdate(String(id));
      if (cancelled) return;
      setLoading(false);

      if (error || !data) {
        if (!embedded) {
          toast.error('Could not load customer details');
          onOpenChange(false);
        }
        return;
      }

      hydrateFromRow(data as Record<string, unknown>);
    })();

    return () => {
      cancelled = true;
    };
  }, [open, jobId, hydrateFromRow, onOpenChange, job]);

  const handleSave = async () => {
    if (!customerId || !jobId) return;
    if (!assertJobAllowed()) return;

    const trimmedEmail = email.trim();
    const trimmedAlternate = alternatePhone.trim();
    const emailChanged = trimmedEmail !== initialEmail.trim();
    const alternateChanged = trimmedAlternate !== initialAlternatePhone.trim();

    if (!emailChanged && !alternateChanged) {
      toast.info('No changes to save');
      return;
    }

    const sessionReady = await ensureSupabaseSessionForWrite();
    if (!sessionReady.ok) {
      toast.error('Could not refresh your session. Please try again.');
      return;
    }

    setSaving(true);
    try {
      const updatePayload: TechnicianCustomerUpdatePatch = {};
      if (emailChanged) updatePayload.email = trimmedEmail;
      if (alternateChanged) updatePayload.alternate_phone = trimmedAlternate;

      const { error } = await db.customers.updateByTechnician(customerId, jobId, updatePayload);
      if (error) {
        toast.error(error.message || 'Could not save customer details');
        return;
      }

      toast.success('Customer contact updated');
      onSaved?.(customerId, updatePayload);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDialogOpenChange = (next: boolean) => {
    if (!next && saving) return;
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="w-5 h-5" />
            Update customer contact
          </DialogTitle>
          <DialogDescription asChild>
            <span>
              {jobNumber ? `Job #${jobNumber} · ` : ''}
              You can update email and alternate phone only.
            </span>
          </DialogDescription>
        </DialogHeader>

        {loading && !customerId ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            Loading customer…
          </div>
        ) : !jobAllowed ? (
          <div className="py-8 text-center text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4">
            Customer details can only be updated while this job is active and assigned to you.
          </div>
        ) : (
          <div className="space-y-4 py-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="tech-cust-name">Customer name</Label>
                <Input id="tech-cust-name" value={fullName} readOnly className="bg-muted/50" tabIndex={-1} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tech-cust-primary-phone">Primary phone</Label>
                <Input
                  id="tech-cust-primary-phone"
                  value={primaryPhone}
                  readOnly
                  className="bg-muted/50"
                  tabIndex={-1}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tech-cust-email">Email</Label>
              <Input
                id="tech-cust-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="customer@email.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tech-cust-alt-phone">Alternate phone</Label>
              <Input
                id="tech-cust-alt-phone"
                type="tel"
                value={alternatePhone}
                onChange={(e) => setAlternatePhone(e.target.value)}
                placeholder="Secondary contact (optional)"
              />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={loading || saving || !jobAllowed || !customerId}
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving…
              </>
            ) : (
              'Save changes'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TechnicianCustomerUpdateDialog;
