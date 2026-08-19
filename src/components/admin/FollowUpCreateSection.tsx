import { ChevronDown } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import {
  FollowUpScheduleFields,
  type FollowUpScheduleValue,
} from '@/components/admin/FollowUpScheduleFields';

type FollowUpCreateSectionProps = {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  value: FollowUpScheduleValue;
  onChange: (next: FollowUpScheduleValue) => void;
  hasActiveAmc?: boolean;
  idPrefix?: string;
  onEnable?: () => void;
};

export function FollowUpCreateSection({
  enabled,
  onEnabledChange,
  value,
  onChange,
  hasActiveAmc = false,
  idPrefix = 'followup',
  onEnable,
}: FollowUpCreateSectionProps) {
  const handleToggle = (on: boolean) => {
    onEnabledChange(on);
    if (on) onEnable?.();
  };

  return (
    <Collapsible open={enabled} onOpenChange={handleToggle}>
      <div
        className={cn(
          'rounded-lg border transition-colors',
          enabled ? 'border-indigo-200 bg-indigo-50/50' : 'border-border bg-muted/30'
        )}
      >
        <div className="flex items-center gap-3 p-3">
          <Checkbox
            id={`${idPrefix}-toggle`}
            checked={enabled}
            onCheckedChange={(checked) => handleToggle(checked === true)}
            className="shrink-0"
          />
          <Label
            htmlFor={`${idPrefix}-toggle`}
            className="flex flex-1 cursor-pointer items-center justify-between gap-2 text-sm font-medium leading-snug"
          >
            <span>Create and schedule a follow-up</span>
            <ChevronDown
              className={cn(
                'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
                enabled && 'rotate-180'
              )}
            />
          </Label>
        </div>
        <CollapsibleContent className="overflow-hidden text-sm transition-all data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
          <div className="space-y-4 border-t border-indigo-200/80 px-3 pb-3 pt-3">
            <p className="text-xs leading-snug text-muted-foreground">
              Job goes to the Follow-up tab instead of Ongoing. Same date, time, reason, auto-move, and
              AMC reminder as the follow-up dialog.
            </p>
            <FollowUpScheduleFields
              idPrefix={idPrefix}
              value={value}
              onChange={onChange}
              hasActiveAmc={hasActiveAmc}
            />
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
