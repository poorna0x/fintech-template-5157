import { useMemo, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/ui/date-picker';
import { CustomAppointmentTimeSelect } from '@/components/admin/CustomAppointmentTimeSelect';
import { SUGGESTED_FOLLOW_UP_REASONS } from '@/lib/followUpReasons';

export type FollowUpScheduleValue = {
  followUpDate: string;
  followUpTime: string;
  followUpReason: string;
  autoMoveToOngoingOnDate: boolean;
  addAmcReminder: boolean;
};

type FollowUpScheduleFieldsProps = {
  value: FollowUpScheduleValue;
  onChange: (next: FollowUpScheduleValue) => void;
  hasActiveAmc?: boolean;
  idPrefix?: string;
};

export function FollowUpScheduleFields({
  value,
  onChange,
  hasActiveAmc = false,
  idPrefix = 'followup',
}: FollowUpScheduleFieldsProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const reasonInputRef = useRef<HTMLInputElement>(null);

  const filteredSuggestions = useMemo(() => {
    if (!value.followUpReason.trim()) return [];
    const lower = value.followUpReason.toLowerCase();
    return SUGGESTED_FOLLOW_UP_REASONS.filter((s) => s.toLowerCase().includes(lower));
  }, [value.followUpReason]);

  const patch = (partial: Partial<FollowUpScheduleValue>) =>
    onChange({ ...value, ...partial });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-date`}>Follow-up Date *</Label>
          <DatePicker
            value={value.followUpDate || undefined}
            onChange={(v) => v && patch({ followUpDate: v })}
            placeholder="Pick date"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-time`}>Follow-up Time *</Label>
          <CustomAppointmentTimeSelect
            id={`${idPrefix}-time`}
            value={value.followUpTime}
            onChange={(followUpTime) => patch({ followUpTime })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-reason`}>Reason</Label>
        <div className="relative">
          <Input
            ref={reasonInputRef}
            id={`${idPrefix}-reason`}
            placeholder="Type a reason..."
            value={value.followUpReason}
            onChange={(e) => {
              patch({ followUpReason: e.target.value });
              setShowSuggestions(e.target.value.length > 0);
            }}
            onFocus={() => setShowSuggestions(value.followUpReason.length > 0)}
            onBlur={() => {
              setTimeout(() => setShowSuggestions(false), 200);
            }}
          />
          {showSuggestions && filteredSuggestions.length > 0 && (
            <div className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-gray-300 bg-white shadow-lg">
              {filteredSuggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    patch({ followUpReason: suggestion });
                    setShowSuggestions(false);
                    reasonInputRef.current?.blur();
                  }}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-md border border-border bg-muted/40 px-3 py-3">
        <Checkbox
          id={`${idPrefix}-auto-move`}
          checked={value.autoMoveToOngoingOnDate}
          onCheckedChange={(checked) => patch({ autoMoveToOngoingOnDate: checked === true })}
          className="mt-0.5"
        />
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-auto-move`} className="cursor-pointer text-sm font-medium leading-snug">
            Auto move to Ongoing on follow-up day
          </Label>
          <p className="text-xs leading-snug text-muted-foreground">
            When checked, this job moves to Ongoing as unassigned on the follow-up date when you open admin.
          </p>
        </div>
      </div>

      {hasActiveAmc && (
        <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-3">
          <Checkbox
            id={`${idPrefix}-amc-reminder`}
            checked={value.addAmcReminder}
            onCheckedChange={(checked) => patch({ addAmcReminder: checked === true })}
            className="mt-0.5"
          />
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-amc-reminder`} className="cursor-pointer text-sm font-medium leading-snug">
              Add reminder and show in Follow-up
            </Label>
            <p className="text-xs leading-snug text-muted-foreground">
              Creates a customer reminder for this date. AMC Service jobs are normally hidden from Follow-up, but this one will appear like a normal follow-up.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
