import { useState, type ReactNode } from 'react';
import { Loader2, Send } from 'lucide-react';
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
  buildQuickBookingCancelledTemplate,
  buildQuickHelloTemplate,
  buildQuickWfsCollectTemplate,
  wfsCollectFallbackNames,
  wfsHelloFallbackNames,
  buildQuickTemplateSend,
  filterQuickTemplatesByApproved,
  isQuickTemplateReady,
  type WhatsAppQuickReplyContext,
  type WhatsAppQuickTemplateReply,
  type WhatsAppQuickTemplateSend,
  type WhatsAppQuickTextReply,
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
  /** Inbox: start bot book flow (location → flat → photo → date) */
  onStartBookLocationPhoto?: () => void | Promise<void>;
  /** 24h window: native WhatsApp *Send location* button (not plain text) */
  onRequestLocation?: () => void | Promise<void>;
  /** 24h window: ask purifier photo step */
  onRequestPhoto?: () => void | Promise<void>;
  /** 24h window: ask building / flat with Skip button */
  onRequestBuildingFlat?: () => void | Promise<void>;
  /** 24h window: Hi from WFS → ask full name */
  onRequestName?: () => void | Promise<void>;
  /** 24h window: Water Filter Service flow (location → date → photo) */
  onStartWaterFilterService?: () => void | Promise<void>;
  insertMode?: 'replace' | 'append';
};

export type WhatsAppQuickContextFieldsProps = {
  amount?: string;
  whenLabel?: string;
  technicianName?: string;
  skipBrandLabel?: boolean;
  onAmountChange?: (value: string) => void;
  onWhenChange?: (value: string) => void;
  onTechnicianChange?: (value: string) => void;
  onSkipBrandLabelChange?: (value: boolean) => void;
  className?: string;
};

/** Optional amount / when / tech — fills template variables for quick sends. */
export function WhatsAppQuickContextFields({
  amount = '',
  whenLabel = '',
  technicianName = '',
  skipBrandLabel = false,
  onAmountChange,
  onWhenChange,
  onTechnicianChange,
  onSkipBrandLabelChange,
  className,
}: WhatsAppQuickContextFieldsProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="grid grid-cols-3 gap-1.5">
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
      {onSkipBrandLabelChange ? (
        <label className="flex cursor-pointer items-center gap-2 text-[11px] text-[#667781]">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 cursor-pointer accent-[#008069]"
            checked={skipBrandLabel}
            onChange={(e) => onSkipBrandLabelChange(e.target.checked)}
          />
          Ask templates: skip brand (say “Water Filter Service” only)
        </label>
      ) : null}
    </div>
  );
}

function chipClass(disabled: boolean) {
  return cn(
    'h-7 shrink-0 cursor-pointer rounded-full px-2.5 text-[11px] font-medium',
    disabled && 'pointer-events-none opacity-50'
  );
}

function ChipRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-[#667781]">
        {label}
      </span>
      {children}
    </div>
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
  onStartBookLocationPhoto,
  onRequestLocation,
  onRequestPhoto,
  onRequestBuildingFlat,
  onRequestName,
  onStartWaterFilterService,
  insertMode = 'replace',
}: WhatsAppQuickRepliesBarProps) {
  const [customQuick, setCustomQuick] = useState('');
  const [customSending, setCustomSending] = useState(false);

  const templateReplies = filterQuickTemplatesByApproved(
    WHATSAPP_QUICK_TEMPLATE_REPLIES.filter((r) => r.id !== 'tpl_hello'),
    approvedTemplateNames
  );

  const askReplies = WHATSAPP_QUICK_TEXT_REPLIES.filter((r) => r.group === 'request');
  const otherReplies = WHATSAPP_QUICK_TEXT_REPLIES.filter((r) => r.group !== 'request');

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

  const handleChip = (item: WhatsAppQuickTextReply) => {
    if (windowOpen && item.id === 'wfs_collect' && onRequestLocation) {
      void onRequestLocation();
      return;
    }
    if (
      windowOpen &&
      (item.id === 'share_location' ||
        item.id === 'share_location_lead') &&
      onRequestLocation
    ) {
      void onRequestLocation();
      return;
    }
    if (windowOpen && item.id === 'share_photo' && onRequestPhoto) {
      void onRequestPhoto();
      return;
    }
    if (windowOpen && item.id === 'share_loc_photo' && onStartBookLocationPhoto) {
      void onStartBookLocationPhoto();
      return;
    }
    if (windowOpen && item.id === 'share_flat' && onRequestBuildingFlat) {
      void onRequestBuildingFlat();
      return;
    }
    if (windowOpen && item.id === 'ask_name' && onRequestName) {
      void onRequestName();
      return;
    }
    if (windowOpen && item.id === 'ask_name_long' && onRequestName) {
      void onRequestName();
      return;
    }
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
  };

  const sendCustomQuick = async () => {
    const text = customQuick.trim();
    if (!text || disabled || !onSendText) return;
    setCustomSending(true);
    try {
      await onSendText(text);
      setCustomQuick('');
    } finally {
      setCustomSending(false);
    }
  };

  const handleTemplate = async (reply: WhatsAppQuickTemplateReply) => {
    if (disabled) return;
    if (windowOpen && reply.id === 'tpl_wfs_collect' && onRequestLocation) {
      await onRequestLocation();
      return;
    }
    if (
      windowOpen &&
      (reply.id === 'tpl_ask_location') &&
      onRequestLocation
    ) {
      await onRequestLocation();
      return;
    }
    if (windowOpen && reply.id === 'tpl_ask_photo' && onRequestPhoto) {
      await onRequestPhoto();
      return;
    }
    if (windowOpen && reply.id === 'tpl_ask_loc_flat_photo' && onStartBookLocationPhoto) {
      await onStartBookLocationPhoto();
      return;
    }
    if (windowOpen && reply.id === 'tpl_ask_flat' && onRequestBuildingFlat) {
      await onRequestBuildingFlat();
      return;
    }
    if (windowOpen && reply.id === 'tpl_ask_name' && onRequestName) {
      await onRequestName();
      return;
    }
    if (windowOpen && reply.id === 'tpl_ask_name_long' && onRequestName) {
      await onRequestName();
      return;
    }
    const payload = buildQuickTemplateSend(reply, context);
    if (!isQuickTemplateReady(reply, context)) {
      onPickTemplate?.(payload);
      return;
    }
    await onSendTemplate?.(payload);
  };

  const handleHelloTpl = async () => {
    if (disabled) return;
    const payload = buildQuickHelloTemplate(context, approvedTemplateNames);
    const ok =
      !approvedTemplateNames?.size ||
      wfsHelloFallbackNames().some((n) => approvedTemplateNames.has(n)) ||
      approvedTemplateNames.has('svc_hello') ||
      approvedTemplateNames.has('svc_smoke_update');
    if (!ok) {
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
      approvedTemplateNames.has('svc_missed_call') ||
      approvedTemplateNames.has('svc_missed_call_v2') ||
      approvedTemplateNames.has('svc_missed_call_v3') ||
      approvedTemplateNames.has('missed_call_callback_ero_cta') ||
      approvedTemplateNames.has('missed_call_callback_hro_cta') ||
      approvedTemplateNames.has('missed_call_callback_ero_cta_v3') ||
      approvedTemplateNames.has('missed_call_callback_hro_cta_v3') ||
      approvedTemplateNames.has('missed_call_callback_ero_cta_v4') ||
      approvedTemplateNames.has('missed_call_callback_hro_cta_v4');
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
      approvedTemplateNames.has('svc_booking_confirmed_letter_ero_v3') ||
      approvedTemplateNames.has('svc_booking_confirmed_letter_hro_v3') ||
      approvedTemplateNames.has('svc_booking_confirmed_letter_ero_v2') ||
      approvedTemplateNames.has('svc_booking_confirmed_letter_hro_v2') ||
      approvedTemplateNames.has('svc_booking_confirmed_letter_ero') ||
      approvedTemplateNames.has('svc_booking_confirmed_letter_hro') ||
      approvedTemplateNames.has('svc_booking_confirmed_ero_v2') ||
      approvedTemplateNames.has('svc_booking_confirmed_hro_v2') ||
      approvedTemplateNames.has('svc_booking_confirmed_ero') ||
      approvedTemplateNames.has('svc_booking_confirmed_hro') ||
      approvedTemplateNames.has('svc_visit_confirmed');
    if (!ok) {
      onPickTemplate?.(payload);
      return;
    }
    await onSendTemplate?.(payload);
  };

  const handleBookingCancelledTpl = async () => {
    if (disabled) return;
    const payload = buildQuickBookingCancelledTemplate(context);
    const ok =
      !approvedTemplateNames?.size ||
      approvedTemplateNames.has(payload.templateName) ||
      approvedTemplateNames.has('svc_booking_cancelled_letter_ero_v5') ||
      approvedTemplateNames.has('svc_booking_cancelled_letter_hro_v5') ||
      approvedTemplateNames.has('svc_booking_cancelled_letter_ero_v4') ||
      approvedTemplateNames.has('svc_booking_cancelled_letter_hro_v4') ||
      approvedTemplateNames.has('svc_booking_cancelled_letter_ero_v3') ||
      approvedTemplateNames.has('svc_booking_cancelled_letter_hro_v3') ||
      approvedTemplateNames.has('svc_booking_cancelled_letter_ero_v2') ||
      approvedTemplateNames.has('svc_booking_cancelled_letter_hro_v2') ||
      approvedTemplateNames.has('svc_booking_cancelled_letter_ero') ||
      approvedTemplateNames.has('svc_booking_cancelled_letter_hro') ||
      approvedTemplateNames.has('svc_booking_cancelled_ero_v2') ||
      approvedTemplateNames.has('svc_booking_cancelled_hro_v2') ||
      approvedTemplateNames.has('svc_visit_cancelled_ero') ||
      approvedTemplateNames.has('svc_visit_cancelled_hro');
    if (!ok) {
      onPickTemplate?.(payload);
      return;
    }
    await onSendTemplate?.(payload);
  };

  const showHelloTpl =
    !approvedTemplateNames?.size ||
    wfsHelloFallbackNames().some((n) => approvedTemplateNames.has(n)) ||
    approvedTemplateNames.has('svc_hello') ||
    approvedTemplateNames.has('svc_smoke_update');

  const showMissedCallTpl =
    !approvedTemplateNames?.size ||
    approvedTemplateNames.has('svc_missed_call') ||
    approvedTemplateNames.has('svc_missed_call_v2') ||
    approvedTemplateNames.has('svc_missed_call_v3') ||
    approvedTemplateNames.has('missed_call_callback_ero_cta') ||
    approvedTemplateNames.has('missed_call_callback_hro_cta') ||
    approvedTemplateNames.has('missed_call_callback_ero_cta_v3') ||
    approvedTemplateNames.has('missed_call_callback_hro_cta_v3') ||
    approvedTemplateNames.has('missed_call_callback_ero_cta_v4') ||
    approvedTemplateNames.has('missed_call_callback_hro_cta_v4');

  const showBookVisit =
    !approvedTemplateNames?.size ||
    approvedTemplateNames.has('existing_service_schedule_ero_cta_v3') ||
    approvedTemplateNames.has('existing_service_schedule_hro_cta_v3') ||
    approvedTemplateNames.has('existing_service_schedule_ero_cta_v2') ||
    approvedTemplateNames.has('existing_service_schedule_hro_cta_v2') ||
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
    approvedTemplateNames.has('svc_booking_confirmed_letter_ero_v3') ||
    approvedTemplateNames.has('svc_booking_confirmed_letter_hro_v3') ||
    approvedTemplateNames.has('svc_booking_confirmed_letter_ero_v2') ||
    approvedTemplateNames.has('svc_booking_confirmed_letter_hro_v2') ||
    approvedTemplateNames.has('svc_booking_confirmed_letter_ero') ||
    approvedTemplateNames.has('svc_booking_confirmed_letter_hro') ||
    approvedTemplateNames.has('svc_booking_confirmed_ero_v2') ||
    approvedTemplateNames.has('svc_booking_confirmed_hro_v2') ||
    approvedTemplateNames.has('svc_booking_confirmed_ero') ||
    approvedTemplateNames.has('svc_booking_confirmed_hro') ||
    approvedTemplateNames.has('svc_visit_confirmed');

  const showBookingCancelledTpl =
    !approvedTemplateNames?.size ||
    approvedTemplateNames.has('svc_booking_cancelled_letter_ero_v5') ||
    approvedTemplateNames.has('svc_booking_cancelled_letter_hro_v5') ||
    approvedTemplateNames.has('svc_booking_cancelled_letter_ero_v4') ||
    approvedTemplateNames.has('svc_booking_cancelled_letter_hro_v4') ||
    approvedTemplateNames.has('svc_booking_cancelled_letter_ero_v3') ||
    approvedTemplateNames.has('svc_booking_cancelled_letter_hro_v3') ||
    approvedTemplateNames.has('svc_booking_cancelled_letter_ero_v2') ||
    approvedTemplateNames.has('svc_booking_cancelled_letter_hro_v2') ||
    approvedTemplateNames.has('svc_booking_cancelled_letter_ero') ||
    approvedTemplateNames.has('svc_booking_cancelled_letter_hro') ||
    approvedTemplateNames.has('svc_booking_cancelled_ero_v2') ||
    approvedTemplateNames.has('svc_booking_cancelled_hro_v2') ||
    approvedTemplateNames.has('svc_visit_cancelled_ero') ||
    approvedTemplateNames.has('svc_visit_cancelled_hro');

  if (!windowOpen && !showTemplates && !onStartBookLocationPhoto) return null;

  const renderTextChip = (item: WhatsAppQuickTextReply) => (
    <Button
      key={item.id}
      type="button"
      variant={item.instant ? 'default' : 'outline'}
      size="sm"
      disabled={disabled}
      title={item.instant ? 'Tap to send now' : 'Tap to put in composer'}
      className={cn(
        chipClass(disabled),
        item.instant &&
          'border-[#25d366] bg-[#25d366] text-white hover:bg-[#1da851] hover:text-white'
      )}
      onClick={() => handleChip(item)}
    >
      {item.label}
    </Button>
  );

  return (
    <div className={cn('space-y-1.5', className)}>
      {onStartBookLocationPhoto && !windowOpen ? (
        <ChipRow label="Book">
          <Button
            type="button"
            variant="default"
            size="sm"
            disabled={disabled}
            className={cn(
              chipClass(disabled),
              'border-[#008069] bg-[#008069] text-white hover:bg-[#006e5a] hover:text-white'
            )}
            onClick={() => void onStartBookLocationPhoto()}
          >
            Book · loc+photo
          </Button>
        </ChipRow>
      ) : null}

      {windowOpen ? (
        <>
          <ChipRow label="Ask">
            {askReplies.map(renderTextChip)}
          </ChipRow>

          <ChipRow label="Quick">{otherReplies.map(renderTextChip)}</ChipRow>

          {onSendText ? (
            <div className="flex items-center gap-1.5">
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-[#667781]">
                Say
              </span>
              <Input
                value={customQuick}
                onChange={(e) => setCustomQuick(e.target.value)}
                placeholder="Type any quick message…"
                className="h-8 min-w-0 flex-1 text-xs"
                disabled={disabled || customSending}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void sendCustomQuick();
                  }
                }}
              />
              <Button
                type="button"
                size="sm"
                disabled={disabled || customSending || !customQuick.trim()}
                className="h-8 shrink-0 cursor-pointer bg-[#25d366] px-2.5 text-white hover:bg-[#1da851]"
                onClick={() => void sendCustomQuick()}
                title="Send now"
              >
                {customSending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          ) : null}
        </>
      ) : null}

      {showTemplates && (!windowOpen || templateReplies.length > 0) ? (
        <ChipRow label={windowOpen ? 'Templates' : 'Quick templates'}>
          {showHelloTpl ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={disabled}
              className={chipClass(disabled)}
              onClick={() => void handleHelloTpl()}
            >
              Hello
            </Button>
          ) : null}
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
          {showBookingCancelledTpl ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={disabled}
              className={chipClass(disabled)}
              onClick={() => void handleBookingCancelledTpl()}
            >
              Booking cancelled
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
        </ChipRow>
      ) : null}
    </div>
  );
}

export default WhatsAppQuickRepliesBar;
