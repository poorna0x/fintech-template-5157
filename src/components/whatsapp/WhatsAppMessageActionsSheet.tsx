import { useMemo, useState } from 'react';
import { CornerUpRight, Loader2, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  displayPhone,
  isWithinCustomerServiceWindow,
  previewMessageBody,
  type WhatsAppMessageRow,
  type WhatsAppThread,
} from '@/lib/whatsappInbox';
import { WhatsAppAvatar } from '@/components/whatsapp/WhatsAppTicks';
import { messageHasDeletableFile } from '@/lib/whatsappMessageActions';

type Props = {
  message: WhatsAppMessageRow | null;
  threads: WhatsAppThread[];
  currentPhone: string | null;
  busy: boolean;
  onClose: () => void;
  onDelete: () => void;
  onForwardTo: (phone: string, customerId?: string | null) => void;
};

export function WhatsAppMessageActionsSheet({
  message,
  threads,
  currentPhone,
  busy,
  onClose,
  onDelete,
  onForwardTo,
}: Props) {
  const [forwardOpen, setForwardOpen] = useState(false);
  const [query, setQuery] = useState('');

  const hasFile = message ? messageHasDeletableFile(message) : false;
  const preview = message
    ? previewMessageBody({
        body: message.body,
        msg_type: message.msg_type,
        filename: message.filename,
        media_url: message.media_url,
        media_mime: message.media_mime,
      })
    : '';

  const destinations = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const current = String(currentPhone || '').replace(/\D/g, '');
    return threads
      .filter((t) => t.phone_e164 !== current)
      .filter((t, index, all) => all.findIndex((row) => row.phone_e164 === t.phone_e164) === index)
      .filter((t) => {
        if (!needle) return true;
        const name = String(t.customer_name || '').toLowerCase();
        const phone = displayPhone(t.phone_e164).toLowerCase();
        return name.includes(needle) || phone.includes(needle) || t.phone_e164.includes(needle);
      })
      .slice()
      .sort((a, b) => {
        const aOpen = isWithinCustomerServiceWindow(a.inbound_at) ? 0 : 1;
        const bOpen = isWithinCustomerServiceWindow(b.inbound_at) ? 0 : 1;
        if (aOpen !== bOpen) return aOpen - bOpen;
        return new Date(b.last_at).getTime() - new Date(a.last_at).getTime();
      });
  }, [threads, query, currentPhone]);

  return (
    <>
      <Dialog
        open={Boolean(message) && !forwardOpen}
        onOpenChange={(open) => {
          if (!open && !busy) onClose();
        }}
      >
        <DialogContent className="sm:max-w-sm border-[#2a3942] bg-[#111b21] text-[#e9edef]">
          <DialogHeader>
            <DialogTitle>Message</DialogTitle>
            <DialogDescription className="line-clamp-2 text-[#8696a0]">
              {preview || 'Choose an action'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy || !message}
              className="h-auto cursor-pointer justify-start border-[#2a3942] bg-[#202c33] py-3 text-left text-[#e9edef] hover:bg-[#2a3942] hover:text-[#e9edef]"
              onClick={() => setForwardOpen(true)}
            >
              <CornerUpRight className="mr-2 h-4 w-4 shrink-0" />
              Forward
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy || !message}
              className="h-auto cursor-pointer justify-start whitespace-normal border-red-900/40 bg-[#2a1f1f] py-3 text-left text-red-300 hover:bg-[#3b2a2a] hover:text-red-200"
              onClick={onDelete}
            >
              {busy ? (
                <Loader2 className="mr-2 h-4 w-4 shrink-0 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4 shrink-0" />
              )}
              <span>
                <span className="block font-medium">
                  {hasFile ? 'Delete file' : 'Delete message'}
                </span>
                <span className="block text-xs font-normal text-red-300/80">
                  {hasFile
                    ? 'Removes it from this inbox and from storage.'
                    : 'Removes it from this inbox.'}
                </span>
              </span>
            </Button>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              className="cursor-pointer text-[#8696a0] hover:bg-[#202c33] hover:text-[#e9edef]"
              onClick={onClose}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(message) && forwardOpen}
        onOpenChange={(open) => {
          if (busy) return;
          if (!open) {
            setForwardOpen(false);
            setQuery('');
            onClose();
          }
        }}
      >
        <DialogContent className="flex max-h-[85vh] flex-col gap-3 overflow-hidden sm:max-w-md border-[#2a3942] bg-[#111b21] text-[#e9edef]">
          <DialogHeader>
            <DialogTitle>Forward to</DialogTitle>
            <DialogDescription className="text-[#8696a0]">
              Pick an open chat. Cold chats need a customer message in the last 24 hours.
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8696a0]" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or number"
              className="h-11 border-[#2a3942] bg-[#202c33] pl-9 text-[#e9edef] placeholder:text-[#667781]"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {destinations.length === 0 ? (
              <p className="px-2 py-8 text-center text-sm text-[#667781]">No matching chats</p>
            ) : (
              <ul className="space-y-0.5">
                {destinations.map((t) => {
                  const open = isWithinCustomerServiceWindow(t.inbound_at);
                  const title = t.customer_name || displayPhone(t.phone_e164);
                  return (
                    <li key={t.phone_e164}>
                      <button
                        type="button"
                        disabled={busy || !open}
                        onClick={() => onForwardTo(t.phone_e164, t.customer_id)}
                        className={cn(
                          'flex w-full cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors',
                          open
                            ? 'hover:bg-[#202c33]'
                            : 'cursor-not-allowed opacity-45'
                        )}
                      >
                        <WhatsAppAvatar name={t.customer_name} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14.5px] font-medium text-[#e9edef]">
                            {title}
                          </span>
                          <span className="block truncate text-[12px] text-[#667781]">
                            {open ? 'Window open' : 'Cold — customer must message first'}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              className="cursor-pointer text-[#8696a0] hover:bg-[#202c33] hover:text-[#e9edef]"
              onClick={() => {
                setForwardOpen(false);
                setQuery('');
                onClose();
              }}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
