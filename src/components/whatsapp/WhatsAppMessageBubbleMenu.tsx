import { useState } from 'react';
import { ChevronDown, Download, Images, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { WhatsAppInboxLocationDialog } from '@/components/whatsapp/WhatsAppInboxLocationDialog';
import {
  addWhatsAppPhotoToCustomerGallery,
  isWhatsAppImageMessage,
  isWhatsAppLocationMessage,
} from '@/lib/whatsappInboxApplyToCustomer';
import type { WhatsAppMessageRow } from '@/lib/whatsappInbox';

type Props = {
  message: WhatsAppMessageRow;
  customerId?: string | null;
  onDownload?: () => void;
};

export function WhatsAppMessageBubbleMenu({ message, customerId, onDownload }: Props) {
  const [busy, setBusy] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const isImage = isWhatsAppImageMessage(message);
  const isLocation = isWhatsAppLocationMessage(message);
  if (!isImage && !isLocation) return null;

  const run = async (fn: () => Promise<{ ok: boolean; error?: string; address?: string }>, okMsg: string) => {
    setBusy(true);
    try {
      const result = await fn();
      if (!result.ok) {
        toast.error(result.error || 'Could not update customer');
        return;
      }
      toast.success(result.address ? `${okMsg}: ${result.address}` : okMsg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={busy}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="absolute right-1 top-1 z-20 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-black/40 text-white/90 shadow-sm hover:bg-black/60 disabled:opacity-50"
          title="Message actions"
          aria-label="Message actions"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="z-[80] min-w-[12rem]" onClick={(e) => e.stopPropagation()}>
        {isImage ? (
          <DropdownMenuItem
            className="cursor-pointer"
            disabled={busy}
            onSelect={() =>
              void run(
                () =>
                  addWhatsAppPhotoToCustomerGallery({
                    messageId: message.id,
                    customerId,
                  }),
                'Photo added to customer gallery'
              )
            }
          >
            <Images className="mr-2 h-4 w-4" />
            Add to customer gallery
          </DropdownMenuItem>
        ) : null}
        {isLocation ? (
          <DropdownMenuItem
            className="cursor-pointer"
            disabled={busy}
            onSelect={() => setLocationOpen(true)}
          >
            <MapPin className="mr-2 h-4 w-4" />
            Update customer location
          </DropdownMenuItem>
        ) : null}
        {isImage && onDownload ? (
          <DropdownMenuItem
            className="cursor-pointer"
            onSelect={() => onDownload()}
          >
            <Download className="mr-2 h-4 w-4" />
            Download
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
      {isLocation ? (
        <WhatsAppInboxLocationDialog
          open={locationOpen}
          onOpenChange={setLocationOpen}
          message={message}
          customerId={customerId}
        />
      ) : null}
    </>
  );
}
