import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { WhatsAppIcon } from '@/components/WhatsAppIcon';
import { ExternalLink, PenLine } from 'lucide-react';

interface WhatsAppActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerName?: string;
  /** CRM WhatsApp inbox thread */
  onOpenInbox: () => void;
  /** Open wa.me / phone WhatsApp */
  onOpenNativeWhatsApp: () => void;
  /** Branded Cloud API / template composer */
  onOpenTemplate: () => void;
}

const WhatsAppActionDialog: React.FC<WhatsAppActionDialogProps> = ({
  open,
  onOpenChange,
  customerName,
  onOpenInbox,
  onOpenNativeWhatsApp,
  onOpenTemplate,
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-[425px] w-full overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <WhatsAppIcon className="w-5 h-5 text-gray-600 shrink-0" />
            WhatsApp
          </DialogTitle>
          <DialogDescription className="text-left break-words">
            {customerName
              ? `Choose how to contact ${customerName}`
              : 'Open inbox, phone WhatsApp, or compose a template'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 py-2 min-w-0">
          <Button
            type="button"
            className="w-full max-w-full bg-black hover:bg-gray-800 text-white justify-start items-start h-auto py-3 px-4 whitespace-normal text-left"
            onClick={() => {
              onOpenInbox();
              onOpenChange(false);
            }}
          >
            <WhatsAppIcon className="w-4 h-4 mr-3 shrink-0 mt-0.5" />
            <span className="min-w-0 flex-1 text-left">
              <span className="block font-medium">Open inbox chat</span>
              <span className="block text-xs font-normal text-white/80 leading-snug">
                Jump to this customer&apos;s WhatsApp thread in CRM
              </span>
            </span>
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full max-w-full justify-start items-start h-auto py-3 px-4 whitespace-normal text-left border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50"
            onClick={() => {
              onOpenNativeWhatsApp();
              onOpenChange(false);
            }}
          >
            <ExternalLink className="w-4 h-4 mr-3 shrink-0 mt-0.5 text-emerald-700" />
            <span className="min-w-0 flex-1 text-left">
              <span className="block font-medium text-emerald-900">Open WhatsApp</span>
              <span className="block text-xs font-normal text-emerald-800/80 leading-snug">
                Open the normal WhatsApp app / wa.me on this phone
              </span>
            </span>
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full max-w-full justify-start items-start h-auto py-3 px-4 whitespace-normal text-left"
            onClick={() => {
              onOpenTemplate();
              onOpenChange(false);
            }}
          >
            <PenLine className="w-4 h-4 mr-3 shrink-0 mt-0.5" />
            <span className="min-w-0 flex-1 text-left">
              <span className="block font-medium">Compose message</span>
              <span className="block text-xs font-normal text-muted-foreground leading-snug">
                Templates — send via Cloud API or phone WhatsApp
              </span>
            </span>
          </Button>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default WhatsAppActionDialog;
