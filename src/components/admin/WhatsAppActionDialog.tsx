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
import { PenLine } from 'lucide-react';

interface WhatsAppActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerName?: string;
  onOpenWhatsApp: () => void;
  onOpenTemplate: () => void;
}

const WhatsAppActionDialog: React.FC<WhatsAppActionDialogProps> = ({
  open,
  onOpenChange,
  customerName,
  onOpenWhatsApp,
  onOpenTemplate,
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <WhatsAppIcon className="w-5 h-5 text-gray-600" />
            WhatsApp
          </DialogTitle>
          <DialogDescription>
            {customerName
              ? `Choose how to contact ${customerName}`
              : 'Open WhatsApp directly or use a message template'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 py-2">
          <Button
            type="button"
            className="w-full bg-black hover:bg-gray-800 text-white justify-start h-auto py-3 px-4"
            onClick={() => {
              onOpenWhatsApp();
              onOpenChange(false);
            }}
          >
            <WhatsAppIcon className="w-4 h-4 mr-3 shrink-0" />
            <span className="text-left">
              <span className="block font-medium">Open WhatsApp</span>
              <span className="block text-xs font-normal text-white/80">
                Go straight to chat — no pre-filled message
              </span>
            </span>
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start h-auto py-3 px-4"
            onClick={() => {
              onOpenTemplate();
              onOpenChange(false);
            }}
          >
            <PenLine className="w-4 h-4 mr-3 shrink-0" />
            <span className="text-left">
              <span className="block font-medium">WhatsApp template</span>
              <span className="block text-xs font-normal text-muted-foreground">
                Compose a branded message with booking, AMC, invoice, and more
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
