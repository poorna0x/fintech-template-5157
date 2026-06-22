import { Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SettingsActionCard } from '@/components/admin/SettingsActionCard';
import { EmailSentLogDialog } from '@/components/admin/EmailSentLogDialog';
import { useState } from 'react';

/** Settings — opens sent email log (open tracking is always on for outbound mail). */
export function EmailTrackingSettings() {
  const [logOpen, setLogOpen] = useState(false);

  return (
    <>
      <div id="section-email-tracking" className="scroll-mt-24">
        <SettingsActionCard
          title="Sent email log"
          icon={<Mail />}
          actions={
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto touch-manipulation gap-2 h-11 sm:h-9"
              onClick={() => setLogOpen(true)}
            >
              <Mail className="w-4 h-4 shrink-0" />
              View sent emails
            </Button>
          }
        />
      </div>

      <EmailSentLogDialog open={logOpen} onOpenChange={setLogOpen} />
    </>
  );
}
