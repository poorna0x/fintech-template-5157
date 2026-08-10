import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  WHATSAPP_QUICK_TEMPLATE_REPLIES,
  WHATSAPP_QUICK_TEXT_REPLIES,
  buildQuickBookVisitTemplate,
  buildQuickMissedCallTemplate,
  buildQuickRescheduleTemplate,
  buildQuickUnregisteredTemplate,
  buildQuickBookingConfirmedTemplate,
  buildQuickTemplateSend,
  filterQuickTemplatesByApproved,
  isQuickTemplateReady,
  type WhatsAppQuickReplyContext,
  type WhatsAppQuickTemplateReply,
  type WhatsAppQuickTemplateSend,
} from '@/lib/whatsappQuickMessages';

export type WhatsAppQuickRepliesBarProps = {
  context: WhatsAppQuickReplyContext;
  /** 24h window open — show free-form snippets */
  windowOpen?: boolean;
  /** When false, hide Meta template chips (cold window) */
  showTemplates?: boolean;
  /** Approved Meta template names from whatsapp-templates API */
  approvedTemplateNames?: Set<string> | null;
  disabled?: boolean;
  className?: string;
  /** Insert free-form text (composer / inbox draft) */
  onInsertText?: (text: string) => void;
  /** Send free-form immediately (optional) */
  onSendText?: (text: string) => void | Promise<void>;
  /** Send cold template immediately */
  onSendTemplate?: (payload: WhatsAppQuickTemplateSend) => void | Promise<void>;
  /** Pre-fill template picker when amount etc. is missing */
  onPickTemplate?: (payload: WhatsAppQuickTemplateSend) => void;
  insertMode?: 'replace' | 'append';
};

export type WhatsAppQuickContextFieldsProps = {
  amount?: string;
  whenLabel?: string;
  technicianName?: string;
  onAmountChange?: (value: string) => void;
  onWhenChange?: (value: string) => void;
  onTechnicianChange?: (value: string) => void;
  className?: string;
};

/** Optional amount / when / tech — fills template variables for quick sends. */
export function WhatsAppQuickContextFields({
  amount = '',
  whenLabel = '',
  technicianName = '',
  onAmountChange,
  onWhenChange,
  onTechnicianChange,
  className,
}: WhatsAppQuickContextFieldsProps) {
  return (
    <div className={cn('grid grid-cols-3 gap-1.5', className)}>
      <Input
        value={amount}
        onChange={(e) => onAmountChange?.(e.target.value)}
        placeholder="₹ amount"
        className="h-8 text-xs"
        inputMode="decimal"
      />
      <Input
        value={whenLabel}
        onChange={(e) => onWhenChange?.(e.target.value)}
        placeholder="Visit / due"
        className="h-8 text-xs"
      />
      <Input
        value={technicianName}
        onChange={(e) => onTechnicianChange?.(e.target.value)}
        placeholder="Tech name"
        className="h-8 text-xs"
      />
    </div>
  );
}

function chipClass(disabled: boolean) {
  return cn(
    'h-7 shrink-0 cursor-pointer rounded-full px-2.5 text-[11px] font-medium',
    disabled && 'pointer-events-none opacity-50'
  );
}

export function WhatsAppQuickRepliesBar({
  context,
  windowOpen = true,
  showTemplates = true,
  approvedTemplateNames,
  disabled = false,
  className,
  onInsertText,
  onSendText,
  onSendTemplate,
  onPickTemplate,
  insertMode = 'replace',
}: WhatsAppQuickRepliesBarProps) {
  const templateReplies = filterQuickTemplatesByApproved(
    WHATSAPP_QUICK_TEMPLATE_REPLIES,
    approvedTemplateNames
  );

  const handleText = (text: string, instant?: boolean) => {
    if (disabled) return;
    if (instant && onSendText) {
      void onSendText(text);
      return;
    }
    if (onInsertText) {
      onInsertText(text);
      return;
    }
    void onSendText?.(text);
  };

  const handleTemplate = async (reply: WhatsAppQuickTemplateReply) => {
    if (disabled) return;
    const payload = buildQuickTemplateSend(reply, context);
    if (!isQuickTemplateReady(reply, context)) {
      onPickTemplate?.(payload);
      return;
    }
    await onSendTemplate?.(payload);
  };

  const handleBookVisit = async () => {
    if (disabled) return;
    const payload = buildQuickBookVisitTemplate(context);
    if (approvedTemplateNames?.size && !approvedTemplateNames.has(payload.templateName)) {
      onPickTemplate?.(payload);
      return;
    }
    await onSendTemplate?.(payload);
  };

  const handleMissedCallTpl = async () => {
    if (disabled) return;
    const payload = buildQuickMissedCallTemplate(context);
    const ok =
      !approvedTemplateNames?.size ||
      approvedTemplateNames.has(payload.templateName) ||
      approvedTemplateNames.has('missed_call_callback_ero_cta') ||
      approvedTemplateNames.has('missed_call_callback_hro_cta');
    if (!ok) {
      onPickTemplate?.(payload);
      return;
    }
    await onSendTemplate?.(payload);
  };

  const handleRescheduleTpl = async () => {
    if (disabled) return;
    const payload = buildQuickRescheduleTemplate(context);
    const ok =
      !approvedTemplateNames?.size ||
      approvedTemplateNames.has(payload.templateName) ||
      approvedTemplateNames.has('reschedule_visit_ero_cta') ||
      approvedTemplateNames.has('reschedule_visit_hro_cta');
    if (!ok) {
      onPickTemplate?.(payload);
      return;
    }
    await onSendTemplate?.(payload);
  };

  const handleUnregisteredTpl = async () => {
    if (disabled) return;
    const payload = buildQuickUnregisteredTemplate(context);
    const ok =
      !approvedTemplateNames?.size ||
      approvedTemplateNames.has(payload.templateName) ||
      approvedTemplateNames.has('unregistered_number_service_ero_cta') ||
      approvedTemplateNames.has('unregistered_number_service_hro_cta');
    if (!ok) {
      onPickTemplate?.(payload);
      return;
    }
    await onSendTemplate?.(payload);
  };

  const handleBookingConfirmedTpl = async () => {
    if (disabled) return;
    const payload = buildQuickBookingConfirmedTemplate(context);
    const ok =
      !approvedTemplateNames?.size ||
      approvedTemplateNames.has(payload.templateName) ||
      approvedTemplateNames.has('svc_booking_confirmed_ero') ||
      approvedTemplateNames.has('svc_booking_confirmed_hro') ||
      approvedTemplateNames.has('svc_visit_confirmed');
    if (!ok) {
      onPickTemplate?.(payload);
      return;
    }
    await onSendTemplate?.(payload);
  };

  const showMissedCallTpl =
    !approvedTemplateNames?.size ||
    approvedTemplateNames.has('missed_call_callback_ero_cta') ||
    approvedTemplateNames.has('missed_call_callback_hro_cta');

  const showBookVisit =
    !approvedTemplateNames?.size ||
    approvedTemplateNames.has('existing_service_schedule_ero_cta') ||
    approvedTemplateNames.has('existing_service_schedule_hro_cta');

  const showRescheduleTpl =
    !approvedTemplateNames?.size ||
    approvedTemplateNames.has('reschedule_visit_ero_cta') ||
    approvedTemplateNames.has('reschedule_visit_hro_cta');

  const showUnregisteredTpl =
    !approvedTemplateNames?.size ||
    approvedTemplateNames.has('unregistered_number_service_ero_cta') ||
    approvedTemplateNames.has('unregistered_number_service_hro_cta');

  const showBookingConfirmedTpl =
    !approvedTemplateNames?.size ||
    approvedTemplateNames.has('svc_booking_confirmed_ero') ||
    approvedTemplateNames.has('svc_booking_confirmed_hro') ||
    approvedTemplateNames.has('svc_visit_confirmed');

  if (!windowOpen && !showTemplates) return null;

  return (
    <div className={cn('space-y-1.5', className)}>
      {windowOpen && WHATSAPP_QUICK_TEXT_REPLIES.length > 0 ? (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-[#667781]">
            Quick
          </span>
          {WHATSAPP_QUICK_TEXT_REPLIES.map((item) => (
            <Button
              key={item.id}
              type="button"
              variant={item.instant ? 'default' : 'outline'}
              size="sm"
              disabled={disabled}
              className={cn(
                chipClass(disabled),
                item.instant &&
                  'border-[#25d366] bg-[#25d366] text-white hover:bg-[#1da851] hover:text-white'
              )}
              onClick={() => {
                const text = item.text(context);
                if (item.instant) {
                  handleText(text, true);
                  return;
                }
                if (insertMode === 'append' && onInsertText) {
                  onInsertText(text);
                } else {
                  handleText(text);
                }
              }}
            >
              {item.label}
            </Button>
          ))}
        </div>
      ) : null}

      {showTemplates && (!windowOpen || templateReplies.length > 0) ? (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-[#667781]">
            {windowOpen ? 'Templates' : 'Quick templates'}
          </span>
          {templateReplies.map((item) => (
            <Button
              key={item.id}
              type="button"
              variant="secondary"
              size="sm"
              disabled={disabled}
              className={chipClass(disabled)}
              onClick={() => void handleTemplate(item)}
            >
              {item.label}
            </Button>
          ))}
          {showMissedCallTpl ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={disabled}
              className={chipClass(disabled)}
              onClick={() => void handleMissedCallTpl()}
            >
              Missed call
            </Button>
          ) : null}
          {showBookVisit ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={disabled}
              className={chipClass(disabled)}
              onClick={() => void handleBookVisit()}
            >
              Schedule visit
            </Button>
          ) : null}
          {showRescheduleTpl ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={disabled}
              className={chipClass(disabled)}
              onClick={() => void handleRescheduleTpl()}
            >
              Reschedule
            </Button>
          ) : null}
          {showBookingConfirmedTpl ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={disabled}
              className={chipClass(disabled)}
              onClick={() => void handleBookingConfirmedTpl()}
            >
              Visit confirmed
            </Button>
          ) : null}
          {showUnregisteredTpl ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={disabled}
              className={chipClass(disabled)}
              onClick={() => void handleUnregisteredTpl()}
            >
              Unregistered #
            </Button>
          ) : null}
          {disabled ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[#667781]" /> : null}
        </div>
      ) : null}
    </div>
  );
}

export default WhatsAppQuickRepliesBar;
