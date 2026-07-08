import { useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SettingsActionCard } from '@/components/admin/SettingsActionCard';
import { BookingIntentArchiveDialog } from '@/components/admin/BookingIntentArchiveDialog';

/** Settings — archive of website live-booking rows marked Done. */
export function BookingIntentArchiveSettings() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <SettingsActionCard
        sectionId="booking-intent-archive"
        title="Done booking archive"
        description="When you mark a live website booking as Done, a copy is saved here and the live row is deleted. Delete archive records when you no longer need them."
        icon={<ClipboardCheck />}
        actions={
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto touch-manipulation gap-2 h-11 sm:h-9"
            onClick={() => setOpen(true)}
          >
            <ClipboardCheck className="w-4 h-4 shrink-0" />
            View archive
          </Button>
        }
      />

      <BookingIntentArchiveDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
